"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { NFT_ADDRESS, nftAbi, nftConfigured, ipfsToHttp, ipfsGatewayCount } from "@/contracts/nft";
import { AddressName } from "./AddressName";
import { formatUsd, useEthUsd } from "@/hooks/useEthUsd";

type Metadata = { name?: string; description?: string; image?: string };
type MetadataState = { data?: Metadata; loading: boolean; error: boolean };

const MAX_CARDS = 48;

function useTokenMeta(uri: string | undefined) {
  const [state, setState] = useState<MetadataState>({ loading: Boolean(uri), error: false });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!uri) {
      setState({ loading: false, error: false });
      return;
    }
    let cancelled = false;
    setState({ loading: true, error: false });
    (async () => {
      for (let attempt = 0; attempt < ipfsGatewayCount; attempt++) {
        try {
          const res = await fetch(ipfsToHttp(uri, attempt), {
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) continue;
          const json = (await res.json()) as Metadata;
          if (!json || typeof json !== "object" || typeof json.image !== "string" || !json.image) continue;
          if (!cancelled) setState({ data: json, loading: false, error: false });
          return;
        } catch {
          // try the next gateway
        }
      }
      if (!cancelled) setState({ loading: false, error: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, reload]);

  return { ...state, retry: () => setReload((value) => value + 1) };
}

function Picture({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="art-placeholder">
        This image isn’t reachable right now.
        <button className="inline-retry" type="button" onClick={() => { setAttempt(0); setFailed(false); }}>
          Try again
        </button>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ipfsToHttp(src, attempt)}
      alt={alt}
      onError={() => {
        if (attempt + 1 < ipfsGatewayCount) setAttempt(attempt + 1);
        else setFailed(true);
      }}
    />
  );
}

function Card({ tokenId, owner, uri, ethUsd }: { tokenId: bigint; owner?: `0x${string}`; uri?: string; ethUsd?: number }) {
  const { data: meta, loading, error, retry } = useTokenMeta(uri);
  return (
    <article className="nft-card">
      <div className="nft-art">
        {meta?.image ? (
          <Picture key={meta.image} src={meta.image} alt={meta.name ?? ""} />
        ) : loading ? (
          <div className="art-placeholder skeleton-block">Loading from IPFS…</div>
        ) : error ? (
          <div className="art-placeholder">
            Metadata could not be loaded.
            <button className="inline-retry" type="button" onClick={retry}>Try again</button>
          </div>
        ) : (
          <div className="art-placeholder">Waiting for token metadata…</div>
        )}
      </div>
      <div className="nft-card-body">
        <div className="nft-title-row">
          <h3 className="nft-name">{meta?.name ?? `Untitled #${tokenId.toString()}`}</h3>
          <span className="token-chip">#{tokenId.toString()}</span>
        </div>
        {meta?.description && <p className="nft-description">{meta.description}</p>}
        <p className="nft-owner">
          <span className="detail-label">Current owner</span>
          <AddressName address={owner} className="owner-name" />
        </p>
        <div className="nft-footer">
          <span>1 ETH today</span>
          <strong>{ethUsd === undefined ? "Price unavailable" : formatUsd(ethUsd)}</strong>
        </div>
      </div>
    </article>
  );
}

export function NftGallery() {
  const configured = nftConfigured;
  const { usd: ethUsd } = useEthUsd();

  const total = useReadContract({
    address: NFT_ADDRESS,
    abi: nftAbi,
    functionName: "totalMinted",
    chainId: sepolia.id,
    query: { enabled: configured, refetchInterval: 15_000 },
  });

  const count = total.data ?? 0n;
  const ids = useMemo(() => {
    const length = Number(count > BigInt(MAX_CARDS) ? BigInt(MAX_CARDS) : count);
    return Array.from({ length }, (_, index) => count - 1n - BigInt(index));
  }, [count]);

  const ownerReads = useReadContracts({
    contracts: ids.map((id) => ({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: "ownerOf" as const,
      args: [id] as const,
      chainId: sepolia.id,
    })),
    query: { enabled: configured && ids.length > 0, refetchInterval: 15_000 },
  });

  const uriReads = useReadContracts({
    contracts: ids.map((id) => ({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: "tokenURI" as const,
      args: [id] as const,
      chainId: sepolia.id,
    })),
    query: { enabled: configured && ids.length > 0, refetchInterval: 15_000 },
  });

  if (!configured) {
    return <p className="empty-state">The ClassNFT contract is not configured for Sepolia.</p>;
  }
  if (total.isLoading) return <p className="empty-state"><span className="button-spinner" />Reading recent mints from Sepolia…</p>;
  if (total.isError) {
    return <p className="empty-state error-message">Could not read the ClassNFT contract. Check the Sepolia RPC and try again.</p>;
  }
  if (count === 0n) {
    return (
      <div className="empty-state gallery-empty">
        <span className="empty-mark" aria-hidden="true">01</span>
        <strong>Your gallery starts here</strong>
        <span>Mint the first photo NFT and it will appear here, fetched back from IPFS.</span>
        <Link className="secondary-action empty-cta" href="/#mint">Create the first NFT</Link>
      </div>
    );
  }

  return (
    <div className="gallery-content">
      <p className="gallery-count">
        {count.toString()} minted
        {count > BigInt(MAX_CARDS) ? ` · showing the latest ${MAX_CARDS}` : ""}
      </p>
      <div className="gallery-grid">
        {ids.map((id, i) => (
          <Card
            key={id.toString()}
            tokenId={id}
            owner={ownerReads.data?.[i]?.result as `0x${string}` | undefined}
            uri={uriReads.data?.[i]?.result as string | undefined}
            ethUsd={ethUsd}
          />
        ))}
      </div>
    </div>
  );
}