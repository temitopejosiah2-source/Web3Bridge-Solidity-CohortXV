"use client";

import { useEffect, useState } from "react";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { encodeFunctionData, http, parseEventLogs, type Hash } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { NFT_ADDRESS, nftAbi } from "@/contracts/nft";
import { uploadNft } from "@/lib/ipfs";
import { shrinkImage } from "@/lib/image";

type BatchResult = {
  userOperationHash: Hash;
  transactionHash: Hash;
  smartAccount: `0x${string}`;
  tokenIds: string[];
};

function messageFromError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const item = error as { shortMessage?: string; message?: string };
    return item.shortMessage ?? item.message ?? "The smart-account mint failed. Please try again.";
  }
  return "The smart-account mint failed. Please try again.";
}

export function SmartAccountBatchMint({
  image,
  name,
  description,
}: {
  image: File | null;
  name: string;
  description: string;
}) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id });
  const { switchChainAsync } = useSwitchChain();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [result, setResult] = useState<BatchResult>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/pimlico", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not check smart-account configuration.");
        return response.json() as Promise<{ configured: boolean }>;
      })
      .then((data) => setConfigured(data.configured))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setConfigured(false);
          setStatus(messageFromError(caught));
          setError(true);
        }
      });
    return () => controller.abort();
  }, []);

  async function mintTwice() {
    if (!image || !name.trim() || !address || !publicClient || !walletClient || busy || !configured || chainId !== sepolia.id) return;
    setBusy(true);
    setError(false);
    setResult(undefined);
    try {
      setStatus("Pinning artwork and metadata to IPFS…");
      const uri = await uploadNft(await shrinkImage(image), name.trim(), description.trim());

      setStatus("Preparing your smart account and sponsored batch…");
      const account = await toSimpleSmartAccount({
        client: publicClient,
        owner: walletClient,
        entryPoint: { address: entryPoint07Address, version: "0.7" },
      });
      const pimlicoClient = createPimlicoClient({
        chain: sepolia,
        transport: http("/api/pimlico"),
        entryPoint: { address: entryPoint07Address, version: "0.7" },
      });
      const smartAccountClient = createSmartAccountClient({
        account,
        chain: sepolia,
        client: publicClient,
        bundlerTransport: http("/api/pimlico"),
        paymaster: true,
        userOperation: {
          estimateFeesPerGas: async () => {
            const prices = await pimlicoClient.getUserOperationGasPrice();
            return prices.standard;
          },
        },
      });
      const mintCall = {
        to: NFT_ADDRESS,
        data: encodeFunctionData({
          abi: nftAbi,
          functionName: "mint",
          args: [uri],
        }),
      } as const;

      setStatus("Approve the smart-account UserOperation in your wallet…");
      const userOperationHash = await smartAccountClient.sendUserOperation({
        calls: [mintCall, mintCall],
        paymaster: true,
      });

      setStatus("Waiting for the two-mint UserOperation to confirm on Sepolia…");
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOperationHash,
        timeout: 180_000,
      });
      if (!receipt.success || !receipt.receipt.transactionHash) {
        throw new Error("The UserOperation did not succeed on-chain. Check its hash before retrying.");
      }

      const events = parseEventLogs({
        abi: nftAbi,
        logs: receipt.receipt.logs,
        eventName: "Minted",
      });
      if (events.length !== 2) {
        throw new Error(`The batch confirmed but emitted ${events.length} mint events instead of two.`);
      }
      setResult({
        userOperationHash,
        transactionHash: receipt.receipt.transactionHash,
        smartAccount: account.address,
        tokenIds: events.map((event) => event.args.tokenId.toString()),
      });
      setStatus("Both NFTs were minted by one smart-account UserOperation.");
    } catch (caught) {
      setError(true);
      setStatus(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function switchToSepolia() {
    setError(false);
    setStatus("Approve the Sepolia network switch in your wallet…");
    setSwitchingNetwork(true);
    try {
      await switchChainAsync({ chainId: sepolia.id });
      setStatus("Wallet is on Sepolia. You can submit the two-mint batch.");
    } catch (caught) {
      setError(true);
      setStatus(messageFromError(caught));
    } finally {
      setSwitchingNetwork(false);
    }
  }

  const disabled = !isConnected || !image || !name.trim() || busy || configured !== true || !walletClient || chainId !== sepolia.id;

  return (
    <div className="smart-account-action">
      <button className="secondary-action smart-account-button" type="button" onClick={mintTwice} disabled={disabled}>
        {busy ? <><span className="button-spinner" aria-hidden="true" />Batching two mints…</> : "Gasless batch · mint twice"}
      </button>
      {isConnected && chainId !== sepolia.id && (
        <button className="inline-retry smart-account-network" type="button" onClick={switchToSepolia} disabled={switchingNetwork}>
          {switchingNetwork ? "Switching wallet…" : "Switch connected wallet to Sepolia"}
        </button>
      )}
      <p className="field-help smart-account-note">
        One signed UserOperation sends two mint calls through a Sepolia smart account. Pimlico sponsors gas when the project paymaster policy allows it.
      </p>
      {configured === false && (
        <p className="field-error" role="status">Smart-account mint is not configured yet. Add PIMLICO_API_KEY to the Vercel Production environment and redeploy.</p>
      )}
      {status && <p className={`status-line${error ? " error-message" : result ? " success-message" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{status}</p>}
      {result && (
        <div className="smart-account-result" role="status">
          <p><b>Smart account</b> {result.smartAccount}</p>
          <p><b>Minted tokens</b> #{result.tokenIds.join(" and #")}</p>
          <p className="result-uri"><b>UserOperation hash</b> {result.userOperationHash}</p>
          <a className="inline-link" href={`https://sepolia.etherscan.io/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">
            View UserOperation transaction on Etherscan ↗
          </a>
        </div>
      )}
    </div>
  );
}
