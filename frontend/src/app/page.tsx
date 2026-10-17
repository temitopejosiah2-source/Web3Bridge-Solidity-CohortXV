import { EnsLookup } from "@/components/EnsLookup";
import { EthUsdPrice } from "@/components/EthUsdPrice";
import { MintForm } from "@/components/MintForm";
import { NftGallery } from "@/components/NftGallery";

export default function Home() {
  return (
    <div>
      <section className="page-heading">
        <div>
          <p className="page-kicker">Ethereum Sepolia · Mainnet ENS</p>
          <h1 className="page-title">Mintroom</h1>
          <p className="page-subtitle">
            Make a memory permanent. Pin your photo to IPFS, mint it on Sepolia, and let ENS put a name to its owner.
          </p>
          <div className="hero-badges" aria-label="Studio features">
            <span><i aria-hidden="true" /> IPFS storage</span>
            <span><i aria-hidden="true" /> ENS identities</span>
            <span><i aria-hidden="true" /> Chainlink pricing</span>
          </div>
        </div>
        <EthUsdPrice />
      </section>
      <div className="studio-grid">
        <MintForm />
        <EnsLookup />
      </div>
      <section className="section-space">
        <div className="section-head">
          <div>
            <p className="page-kicker">From the chain</p>
            <h2 className="section-title">Recent mints</h2>
          </div>
          <span className="pill">ClassNFT · Sepolia</span>
        </div>
        <NftGallery />
      </section>
    </div>
  );
}
