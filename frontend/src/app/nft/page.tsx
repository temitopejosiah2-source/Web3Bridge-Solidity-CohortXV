"use client";

import { useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { NFT_ADDRESS, nftAbi, ipfsToHttp } from "@/contracts/nft";
import { uploadNft } from "@/lib/ipfs";

type Metadata = { name: string; description: string; image: string };

export default function NftPage() {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain(); // ask the wallet to move to Sepolia
  const { writeContractAsync } = useWriteContract(); // send a transaction (wallet popup)
  const publicClient = usePublicClient({ chainId: sepolia.id }); // read Sepolia

  // ---------- the form ----------
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [minted, setMinted] = useState<{ tokenId: string; uri: string; hash: string } | null>(null);

  async function mint() {
    if (!image) return;
    try {
      setStatus("1/3 Uploading the image and the metadata to IPFS…");
      const uri = await uploadNft(image, name, description);

      setStatus("2/3 Confirm the mint in your wallet…");
      await switchChainAsync({ chainId: sepolia.id });
      const hash = await writeContractAsync({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: "mint",
        args: [uri],
        chainId: sepolia.id,
      });

      setStatus("3/3 Waiting for the transaction to be in a block…");
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });

      // The contract emitted Minted(to, tokenId, uri). Read the token id from that event.
      const [event] = parseEventLogs({ abi: nftAbi, logs: receipt.logs, eventName: "Minted" });
      setMinted({ tokenId: event.args.tokenId.toString(), uri, hash });
      setViewId(event.args.tokenId.toString());
      setStatus("Done ✅");
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  }

  // ---------- view any token ----------
  const [viewId, setViewId] = useState("0");
  const [meta, setMeta] = useState<Metadata | null>(null);

  const { data: tokenUri } = useReadContract({
    address: NFT_ADDRESS,
    abi: nftAbi,
    functionName: "tokenURI",
    args: [BigInt(viewId || "0")],
    chainId: sepolia.id,
    query: { retry: false },
  });
  const { data: owner } = useReadContract({
    address: NFT_ADDRESS,
    abi: nftAbi,
    functionName: "ownerOf",
    args: [BigInt(viewId || "0")],
    chainId: sepolia.id,
    query: { retry: false },
  });

  async function loadMetadata() {
    if (!tokenUri) return;
    const res = await fetch(ipfsToHttp(tokenUri)); // follow the link, like a wallet does
    setMeta(await res.json());
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Mint an NFT whose picture lives on IPFS</h1>

      <section className="space-y-2">
        <input className="w-full rounded border px-2 py-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded border px-2 py-1" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        <button
          className="block rounded bg-black px-3 py-1 text-white disabled:opacity-50"
          disabled={!isConnected || !image || !name}
          onClick={mint}
        >
          Upload to IPFS + Mint
        </button>
        {!isConnected && <p className="text-sm">Connect your wallet first.</p>}
        <p className="text-sm">{status}</p>
        {minted && (
          <div className="break-all rounded border bg-white p-3 text-sm">
            <p><b>Token id:</b> {minted.tokenId}</p>
            <p><b>Token URI:</b> {minted.uri}</p>
            <p>
              <a className="underline" href={`https://sepolia.etherscan.io/tx/${minted.hash}`} target="_blank">
                See the transaction on Etherscan
              </a>
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Look at any token</h2>
        <input className="w-24 rounded border px-2 py-1" value={viewId} onChange={(e) => setViewId(e.target.value)} />
        <button className="ml-2 rounded border px-3 py-1" onClick={loadMetadata}>Load</button>
        <p className="break-all text-xs text-neutral-500">Owner: {owner ?? "—"} · tokenURI: {tokenUri ?? "—"}</p>
        {meta && (
          <div className="rounded border bg-white p-3">
            <p className="font-medium">{meta.name}</p>
            <p>{meta.description}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ipfsToHttp(meta.image)} alt={meta.name} className="mt-2 max-w-xs rounded" />
          </div>
        )}
      </section>
    </div>
  );
}
