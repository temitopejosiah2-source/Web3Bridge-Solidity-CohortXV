import { LiveAlerts } from "@/components/LiveAlerts";

export default function ActivityPage() {
  return (
    <div className="page-stack">
      <section className="page-heading inner-heading">
        <div>
          <p className="page-kicker">The chain · In real time</p>
          <h1 className="page-title">Activity.</h1>
          <p className="page-subtitle">A live feed of mints from the Mintroom ClassNFT contract.</p>
        </div>
        <span className="pill">Sepolia · Minted events</span>
      </section>
      <LiveAlerts />
    </div>
  );
}
