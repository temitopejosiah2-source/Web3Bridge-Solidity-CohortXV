"use client";

import { useState } from "react";
import { useAccount, useEnsAddress, useEnsAvatar, useEnsName, useEnsText } from "wagmi";
import { mainnet } from "wagmi/chains";
import { normalize } from "viem/ens";

// normalize() turns "Vitalik.ETH" into "vitalik.eth", and THROWS on an invalid name.
function safeNormalize(input: string) {
  try {
    return input ? normalize(input) : undefined;
  } catch {
    return undefined;
  }
}

export default function EnsPage() {
  const [input, setInput] = useState("vitalik.eth");
  const name = safeNormalize(input);
  const { address } = useAccount();

  // Every hook reads from MAINNET, where the real .eth names live. Reading is free.
  const { data: resolved, isLoading } = useEnsAddress({ name, chainId: mainnet.id }); // name -> address
  const { data: avatar } = useEnsAvatar({ name, chainId: mainnet.id }); // the "avatar" record
  const { data: description } = useEnsText({ name, key: "description", chainId: mainnet.id }); // a text record
  const { data: twitter } = useEnsText({ name, key: "com.twitter", chainId: mainnet.id }); // another text record
  const { data: primaryOfResolved } = useEnsName({ address: resolved ?? undefined, chainId: mainnet.id }); // address -> name
  const { data: myName } = useEnsName({ address, chainId: mainnet.id }); // YOUR primary name, if you have one

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ENS lookup</h1>

      <input
        className="w-full rounded border px-2 py-1"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="name.eth"
      />

      {input && !name && <p className="text-red-600">Not a valid ENS name</p>}
      {isLoading && <p>Resolving…</p>}
      {name && !isLoading && !resolved && <p>No address is set for this name.</p>}

      {resolved && (
        <div className="space-y-1 rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatar && <img src={avatar} alt="avatar" className="h-16 w-16 rounded-full" />}
          <p className="break-all"><b>Address:</b> {resolved}</p>
          <p><b>Primary name of that address:</b> {primaryOfResolved ?? "none set"}</p>
          {description && <p><b>Description:</b> {description}</p>}
          {twitter && <p><b>Twitter:</b> @{twitter}</p>}
        </div>
      )}

      {address && (
        <p className="text-sm text-neutral-600">
          Your own primary name on mainnet: <b>{myName ?? "none set"}</b>
        </p>
      )}
    </div>
  );
}
