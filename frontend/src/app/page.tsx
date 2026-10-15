import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Web3Bridge Day 3 dApp</h1>
      <p>One app, three things a real dApp does:</p>
      <ul className="list-disc space-y-1 pl-6">
        <li><Link className="underline" href="/ens">ENS</Link>: show names instead of 0x addresses</li>
        <li><Link className="underline" href="/nft">IPFS NFT</Link>: store a picture on IPFS and mint an NFT that points to it</li>
        <li><Link className="underline" href="/aa">Smart Account</Link>: mint the same NFT from a smart account, with no gas</li>
      </ul>
    </div>
  );
}
