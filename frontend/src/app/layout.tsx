import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "./Providers";
import { Nav } from "../components/Nav";

export const metadata: Metadata = {
  title: "Mintroom · Onchain NFT Studio",
  description: "Mint photos to IPFS as Sepolia NFTs, resolve ENS names, and follow Chainlink ETH/USD.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Every page of the app is drawn inside this layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <Providers>
          <Nav />
          <a className="skip-link" href="#main-content">Skip to content</a>
          <main className="app-main" id="main-content">{children}</main>
          <footer className="site-footer">
            <span>Mintroom <span aria-hidden="true">·</span> Sepolia test studio</span>
            <span className="footer-links">
              <a href="https://sepolia.etherscan.io/address/0xf311E4EA522D00103c1d180115CF5aD53FF0f9C2" target="_blank" rel="noreferrer">
                ClassNFT contract
              </a>
              <a href="https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306" target="_blank" rel="noreferrer">
                Chainlink feed
              </a>
              <span>ENS · Ethereum mainnet</span>
            </span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
