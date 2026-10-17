"use client";

import { useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";

/** Shows the primary ENS name when the address has one, otherwise a short 0x. */
export function AddressName({
  address,
  className = "",
}: {
  address?: `0x${string}`;
  className?: string;
}) {
  const { data: name } = useEnsName({ address, chainId: mainnet.id, query: { enabled: Boolean(address) } });

  if (!address) return <span className={className}>—</span>;

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <span className={className} title={address}>
      {name ?? short}
    </span>
  );
}
