import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <div className="hero-panel">
          <p className="eyebrow">Scoped rental agents on Sui</p>
          <h1>Apply without handing over the keys.</h1>
          <p className="lede" data-testid="core-message">
            World limits who the agent represents. Sui limits what the agent can do.
          </p>
          <div className="cluster" style={{ marginTop: 28 }}>
            <Link href="/renter" className="btn" data-testid="role-renter-link">
              Start as renter
            </Link>
            <Link href="/agent" className="btn secondary" data-testid="role-agent-link">
              Watch agent run
            </Link>
          </div>
        </div>

        <aside className="card stack" aria-label="Demo flow">
          <span className="badge info">Live Sui testnet package</span>
          {[
            ["1", "Renter sets limits", "Rent, location, bedrooms, actions, expiry."],
            ["2", "Packet is encrypted", "Only ciphertext is registered with the provider."],
            ["3", "Agent applies", "It can only act inside the on-chain mandate."],
            ["4", "Provider verifies", "World uniqueness and Sui receipt checks close the loop."],
          ].map(([num, title, copy]) => (
            <div className="step-card" key={num}>
              <span className="step-num">{num}</span>
              <div>
                <h3>{title}</h3>
                <p className="muted" style={{ margin: 0 }}>{copy}</p>
              </div>
            </div>
          ))}
        </aside>
      </section>

      <section className="grid cards" style={{ marginTop: 24 }} aria-label="Role dashboards">
        <RoleCard href="/renter" title="Renter" testId="role-renter-card" copy="Create a bounded mandate and prepare synthetic application packets." />
        <RoleCard href="/provider" title="Provider" testId="role-provider-card" copy="Publish listings, reserve applications, and verify Sui receipts." />
        <RoleCard href="/landlord" title="Landlord" testId="role-landlord-card" copy="Review accepted receipts and request document access." />
      </section>
    </main>
  );
}

function RoleCard({ href, title, copy, testId }: { href: string; title: string; copy: string; testId: string }) {
  return (
    <Link href={href} className="card" data-testid={testId} style={{ color: "inherit" }}>
      <p className="eyebrow" style={{ marginBottom: 8 }}>{title}</p>
      <h2>{title} dashboard</h2>
      <p className="muted">{copy}</p>
      <span>Open {title.toLowerCase()} flow</span>
    </Link>
  );
}
