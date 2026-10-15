// @ts-expect-error Next.js handles CSS imports at build time.
import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./Providers";
import { Nav } from "../components/Nav";

export const metadata: Metadata = { title: "Web3Bridge Day 3 dApp" };

// Every page of the app is drawn inside this layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-2xl space-y-6 p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
