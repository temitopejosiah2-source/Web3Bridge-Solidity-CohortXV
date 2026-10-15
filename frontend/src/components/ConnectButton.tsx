"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount(); // is a wallet connected? which address? which network?
  const { connectors, connect, isPending } = useConnect(); // the list of ways to connect, and the connect action
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button className="rounded bg-neutral-200 px-3 py-1 text-sm" onClick={() => disconnect()}>
        {chain?.name ?? "Unknown network"} · {address?.slice(0, 6)}…{address?.slice(-4)} · disconnect
      </button>
    );
  }

  return (
    <button
      className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
      disabled={isPending}
      onClick={() => connect({ connector: connectors[0] })}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
