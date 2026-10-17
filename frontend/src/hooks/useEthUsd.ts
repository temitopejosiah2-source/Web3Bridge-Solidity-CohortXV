"use client";

import { useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { aggregatorV3Abi, ETH_USD_FEED } from "@/contracts/chainlink";

const REFETCH_MS = 15_000;

export function useEthUsd() {
  const round = useReadContract({
    address: ETH_USD_FEED,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData",
    chainId: sepolia.id,
    query: { refetchInterval: REFETCH_MS },
  });
  const decimals = useReadContract({
    address: ETH_USD_FEED,
    abi: aggregatorV3Abi,
    functionName: "decimals",
    chainId: sepolia.id,
  });

  const answer = round.data?.[1];
  const updatedAt = round.data?.[3];
  const dec = decimals.data ?? 8;

  const usd =
    answer !== undefined && answer > 0n
      ? Number(answer) / 10 ** Number(dec)
      : undefined;

  const ageSeconds =
    updatedAt !== undefined ? Math.max(0, Math.floor(Date.now() / 1000) - Number(updatedAt)) : undefined;

  return {
    usd,
    updatedAt: updatedAt !== undefined ? Number(updatedAt) : undefined,
    ageSeconds,
    isLoading: round.isLoading || decimals.isLoading,
    isError: round.isError || decimals.isError,
        refetch: round.refetch,
    checkedAt: round.dataUpdatedAt,
  };
}

export function formatUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
}

/** Convert an ETH amount (as a JS number) to USD using the live feed. */
export function ethToUsd(eth: number, usdPerEth: number | undefined) {
  if (usdPerEth === undefined) return undefined;
  return eth * usdPerEth;
}
