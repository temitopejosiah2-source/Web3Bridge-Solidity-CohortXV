import { EthUsdPrice } from "@/components/EthUsdPrice";
import { MintForm } from "@/components/MintForm";
import { NftGallery } from "@/components/NftGallery";

export default function NftPage() {
  return (
    <div className="page-stack">
      <section className="page-heading inner-heading">
        <div>
          <p className="page-kicker">Your work · Onchain collection</p>
          <h1 className="page-title">The gallery.</h1>
          <p className="page-subtitle">Every piece is owned on Sepolia, with its artwork and story retrieved from IPFS.</p>
        </div>
        <EthUsdPrice compact />
      </section>
      <MintForm />
      <section className="gallery-section">
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
