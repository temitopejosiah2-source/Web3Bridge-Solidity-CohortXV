"use client";

import { useAccount } from "wagmi";
import { EnsLookup } from "@/components/EnsLookup";
import { AddressName } from "@/components/AddressName";

export default function EnsPage() {
  const { address } = useAccount();

  return (
    <div className="page-stack">
      <section className="page-heading inner-heading">
        <div>
          <p className="page-kicker">Ethereum mainnet · Public records</p>
          <h1 className="page-title">Names, not numbers.</h1>
          <p className="page-subtitle">
            Look up an ENS name to resolve its wallet, profile details, and avatar. Reading is free and doesn’t require a connection.
          </p>
        </div>
        <span className="pill network-pill"><span className="live-dot" /> ENS LOOKUP</span>
      </section>
      <EnsLookup />
      {address && (
        <aside className="wallet-strip">
          <span className="detail-label">Your connected wallet</span>
          <AddressName address={address} className="owner-name" />
        </aside>
      )}
    </div>
  );
}
