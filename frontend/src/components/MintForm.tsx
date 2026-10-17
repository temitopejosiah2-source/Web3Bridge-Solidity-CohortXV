"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { formatEther, parseEventLogs } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { NFT_ADDRESS, nftAbi, nftConfigured } from "@/contracts/nft";
import { shrinkImage } from "@/lib/image";
import { uploadNft } from "@/lib/ipfs";
import { AddressName } from "./AddressName";
import { SmartAccountBatchMint } from "./SmartAccountBatchMint";
import { formatUsd, useEthUsd } from "@/hooks/useEthUsd";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const WALLET_SWITCH_TIMEOUT_MS = 60_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const stages = ["Prepare your art", "Pin to IPFS", "Mint on Sepolia"];

type MintResult = { name: string; tokenId: string; uri: string; hash: string; feeEth: number };

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const item = error as { shortMessage?: string; message?: string };
    return item.shortMessage ?? item.message ?? "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

function switchChainWithTimeout(switchChain: () => Promise<unknown>) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(
        "Your wallet did not finish switching to Sepolia. Check the wallet you selected and approve the network switch, then try again. No image was uploaded."
      ));
    }, WALLET_SWITCH_TIMEOUT_MS);

    switchChain()
      .then(() => resolve())
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}

export function MintForm() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { usd } = useEthUsd();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [gasEth, setGasEth] = useState<number>();
  const [gasError, setGasError] = useState(false);
  const [minted, setMinted] = useState<MintResult | null>(null);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (!address || !publicClient || !nftConfigured) return;
    const client = publicClient;
    let cancelled = false;
    async function estimate() {
      try {
        const [gas, price] = await Promise.all([
          client.estimateContractGas({
            address: NFT_ADDRESS,
            abi: nftAbi,
            functionName: "mint",
            args: ["ipfs://estimate"],
            account: address,
          }),
          client.getGasPrice(),
        ]);
        if (!cancelled) {
          setGasEth(Number(formatEther(gas * price)));
          setGasError(false);
        }
      } catch {
        if (!cancelled) {
          setGasEth(undefined);
          setGasError(true);
        }
      }
    }
    void estimate();
    const id = setInterval(() => void estimate(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, publicClient]);

  const estimatedUsd = gasEth !== undefined && usd !== undefined ? gasEth * usd : undefined;

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setFileError("");
    setMinted(null);
    if (!file) {
      setImage(null);
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      setImage(null);
      setFileError("Choose a JPEG, PNG, WebP, or GIF image.");
      event.currentTarget.value = "";
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setImage(null);
      setFileError("Choose an image smaller than 4 MB.");
      event.currentTarget.value = "";
      return;
    }
    setImage(file);
  }

  async function mint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image || !address || !publicClient || !nftConfigured || busy) return;

    setBusy(true);
    setError(false);
    setMinted(null);
    try {
      if (chainId !== sepolia.id) {
        setStage(1);
        setStatus("Approve the Sepolia network switch in your selected wallet…");
        await switchChainWithTimeout(() => switchChainAsync({ chainId: sepolia.id }));
      }

      setStage(2);
      setStatus("Uploading your image and NFT details to IPFS…");
      const uri = await uploadNft(await shrinkImage(image), name.trim(), description.trim());

      setStage(3);
      setStatus("Confirm the mint in your wallet, then we’ll verify it on-chain…");
      const hash = await writeContractAsync({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: "mint",
        args: [uri],
        chainId: sepolia.id,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [event] = parseEventLogs({ abi: nftAbi, logs: receipt.logs, eventName: "Minted" });
      if (!event) throw new Error("The transaction confirmed, but its Minted event was not found.");

      const feeEth = Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice));
      setMinted({ name: name.trim(), tokenId: event.args.tokenId.toString(), uri, hash, feeEth });
      setStatus("Your NFT is live. It will appear in the gallery below.");
      setStage(0);
    } catch (caught) {
      setError(true);
      setStatus(errorMessage(caught));
      setStage(0);
    } finally {
      setBusy(false);
    }
  }

  const activeStage = busy ? stage : 0;

  return (
    <section className="panel mint-panel" id="mint">
      <div className="panel-body">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Create · 01 / 03</p>
            <h2 className="panel-title">Mint your moment</h2>
            <p className="panel-note">Your NFT is minted to your Sepolia wallet; its media is stored publicly on IPFS.</p>
          </div>
          <span className="panel-mark" aria-hidden="true">01</span>
        </div>

        <div className="fee-card">
          <span className="fee-icon" aria-hidden="true">ETH</span>
          <div className="fee-copy">
            <span className="fee-label">Estimated network fee</span>
            <strong className="fee-value">
              {!address
                ? "Connect to estimate"
                : estimatedUsd !== undefined
                ? `${formatUsd(estimatedUsd)} · ${gasEth?.toFixed(6)} ETH`
                : gasError
                  ? "Estimate unavailable"
                  : "Getting estimate…"}
            </strong>
          </div>
          <span className="fee-live"><span className="live-dot" />Chainlink</span>
        </div>

        <form className="mint-form" onSubmit={mint}>
          <div className="field-group">
            <label className="field-label" htmlFor="nft-name">Artwork name</label>
            <input
              className="text-field"
              id="nft-name"
              maxLength={64}
              placeholder="e.g. Sunday in Lagos"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="nft-description">
              Story <span className="optional-label">Optional</span>
            </label>
            <textarea
              className="text-area"
              id="nft-description"
              maxLength={280}
              placeholder="A few words about this moment…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
            <p className="field-help">{description.length}/280 characters</p>
          </div>

          <div className="field-group">
            <span className="field-label">Choose an image</span>
            <label className={`upload-zone${image ? " has-image" : ""}`} htmlFor="nft-image">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="image-preview" src={previewUrl} alt="" />
              ) : (
                <span className="upload-glyph" aria-hidden="true">+</span>
              )}
              <span className="upload-copy">
                <strong>{image?.name ?? "Tap to choose a photo"}</strong>
                <span>
                  {image ? `${(image.size / (1024 * 1024)).toFixed(2)} MB · ready to pin` : "JPEG, PNG, WebP or GIF · up to 4 MB"}
                </span>
              </span>
              <input
                className="file-input"
                id="nft-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={selectImage}
                aria-describedby={fileError ? "image-error" : "image-help"}
              />
            </label>
            {fileError ? (
              <p className="field-error" id="image-error" role="alert">{fileError}</p>
            ) : (
              <p className="field-help" id="image-help">
                IPFS content is public and permanent. Don’t upload private images.
              </p>
            )}
          </div>

          {busy && (
            <ol className="mint-steps" aria-label="Mint progress">
              {stages.map((label, index) => {
                const number = index + 1;
                const complete = number < activeStage;
                const active = number === activeStage;
                return (
                  <li className={`mint-step${complete ? " complete" : ""}${active ? " active" : ""}`} key={label}>
                    <span className="step-number">{complete ? "✓" : number}</span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <button
            className="primary-action"
            type="submit"
            disabled={busy || !isConnected || !image || !name.trim() || !nftConfigured}
          >
            {busy ? <><span className="button-spinner" aria-hidden="true" />Working on your NFT…</> : "Upload & mint"}
          </button>

          <SmartAccountBatchMint image={image} name={name} description={description} />

          {!isConnected ? (
            <p className="form-footnote">Connect your wallet above to begin. You’ll need a little Sepolia ETH for gas.</p>
          ) : (
            <p className="form-footnote">
              Minting as <AddressName address={address} className="wallet-name" /> · Public IPFS media.
            </p>
          )}
          {!nftConfigured && <p className="field-error" role="alert">The ClassNFT contract is not configured for Sepolia.</p>}
          {status && (
            <p className={`status-line${error ? " error-message" : minted ? " success-message" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
              {status}
            </p>
          )}
        </form>

        {minted && (
          <div className="mint-result" role="status">
            <div className="result-heading">
              <span className="result-check" aria-hidden="true">✓</span>
              <div>
                <p className="result-kicker">On-chain and yours</p>
                <p className="result-title">{minted.name}</p>
              </div>
            </div>
            <p><b>Token</b> #{minted.tokenId}</p>
            <p><b>Network fee</b> {minted.feeEth.toFixed(8)} ETH{usd !== undefined ? ` · ${formatUsd(minted.feeEth * usd)}` : ""}</p>
            <p className="result-uri"><b>IPFS</b> {minted.uri}</p>
            <a className="inline-link" href={`https://sepolia.etherscan.io/tx/${minted.hash}`} target="_blank" rel="noreferrer">
              View transaction on Etherscan <span aria-hidden="true">↗</span>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
