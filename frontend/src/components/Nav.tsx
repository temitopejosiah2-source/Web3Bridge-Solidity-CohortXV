"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";

const links = [
  ["/", "Studio"],
  ["/ens", "ENS lookup"],
  ["/nft", "Gallery"],
  ["/activity", "Activity"],
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Mintroom home">
        <span className="brand-mark" aria-hidden="true">M</span>
        <span>
          <span className="brand-name">MINTROOM</span>
          <span className="brand-caption">ONCHAIN STUDIO</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="Main navigation">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="nav-link"
            aria-current={pathname === href ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ConnectButton />
    </header>
  );
}
