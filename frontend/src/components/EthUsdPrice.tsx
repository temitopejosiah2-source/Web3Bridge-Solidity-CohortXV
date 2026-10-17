"use client";

import { useEffect, useState } from "react";
import { formatAge, formatUsd, useEthUsd } from "@/hooks/useEthUsd";

const STALE_AFTER_SECONDS = 2 * 60 * 60;

export function EthUsdPrice({ compact = false }: { compact?: boolean }) {
  const { usd, ageSeconds, checkedAt, isLoading, isError } = useEthUsd();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) return <div className="price-panel" aria-live="polite">Reading the Sepolia Chainlink feed…</div>;
  if (isError || usd === undefined) {
    return (
      <div className="price-panel" role="status">
        <p className="price-label">ETH / USD · Sepolia</p>
        <p className="price-error">Could not read the Chainlink feed. The mint fee estimate will return when it’s available.</p>
      </div>
    );
  }

  const age = ageSeconds === undefined ? "—" : formatAge(ageSeconds);
  const checkedSecs = checkedAt ? Math.max(0, Math.floor((now - checkedAt) / 1000)) : undefined;
  const checked = checkedSecs === undefined ? "—" : `${checkedSecs}s ago`;
  const stale = ageSeconds !== undefined && ageSeconds > STALE_AFTER_SECONDS;

  if (compact) {
    return (
      <div className={`price-panel${stale ? " is-stale" : ""}`}>
        <p className="price-label">Live ETH / USD · Sepolia</p>
        <p className="price-value" aria-live="polite" aria-atomic="true">{formatUsd(usd)}</p>
        <p className="price-caption">Chainlink feed updated {age}.</p>
        <p className="price-caption">Polled every 15 seconds · checked {checked}.</p>
        {stale && <p className="price-error">This feed round is stale.</p>}
      </div>
    );
  }

  return (
    <div className={`price-panel${stale ? " is-stale" : ""}`}>
      <div className="price-topline">
        <span className="price-label">Live ETH / USD · Sepolia</span>
        <span className={`pill${stale ? " stale-pill" : ""}`}>
          <span className="live-dot" />{stale ? "STALE" : "LIVE"}
        </span>
      </div>
      <p className="price-value" aria-live="polite" aria-atomic="true">{formatUsd(usd)}</p>
      <p className="price-caption">Chainlink round updated {age}.</p>
      <p className="price-caption">Polled every 15 seconds · last check {checked}.</p>
      {stale && <p className="price-error">Feed update is over 2 hours old; treat this quote as stale.</p>}
    </div>
  );
}