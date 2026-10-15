import Link from "next/link";
import { ConnectButton } from "./ConnectButton";

const links = [
  ["/", "Home"],
  ["/ens", "ENS"],
  ["/nft", "IPFS NFT"],
  ["/aa", "Smart Account"],
];

export function Nav() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <nav className="flex flex-wrap gap-4 text-sm">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <ConnectButton />
    </header>
  );
}
