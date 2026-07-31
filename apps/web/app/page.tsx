import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <div className="rounded-[var(--radius)] border border-solid border-line bg-panel p-[clamp(28px,5vw,58px)] shadow-[var(--shadow)]">
          <p className="eyebrow">Scoped rental agents on Sui</p>
          <h1>Apply without handing over the keys.</h1>
          <p className="lede" data-testid="core-message">
            World limits who the agent represents. Sui limits what the agent can do.
          </p>
          <div className="cluster mt-7">
            <Link href="/renter" className="btn" data-testid="role-renter-link">
              Start as renter
            </Link>
            <Link href="/agent" className="btn secondary" data-testid="role-agent-link">
              Watch agent run
            </Link>
          </div>
        </div>

        <Card className="stack" aria-label="Demo flow">
          {/* Badge is w-fit and content-centered by default; the legacy span was an
              unstyled flex item that stretched to the stack's full width (align-items:
              stretch) with its text left-aligned (no justify-content set). Force both
              back so the pill matches the pre-migration render. */}
          <Badge variant="info" className="w-full! justify-start!">Live Sui testnet package</Badge>
          {[
            ["1", "Renter sets limits", "Rent, location, bedrooms, actions, expiry."],
            ["2", "Packet is encrypted", "Only ciphertext is registered with the provider."],
            ["3", "Agent applies", "It can only act inside the on-chain mandate."],
            ["4", "Provider verifies", "World uniqueness and Sui receipt checks close the loop."],
          ].map(([num, title, copy]) => (
            <div
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-[var(--radius)] border border-solid border-line bg-panel p-5 shadow-[var(--shadow)]"
              key={num}
            >
              <span className="step-num">{num}</span>
              <div>
                {/* RD-219 U3b: reproduces legacy `.step-card h3 { margin: 0 0 8px;
                    letter-spacing: -.025em }` (globals.css:133) — this div is a hand-rolled
                    step-card, not a <Card>, so it doesn't inherit the primitive's fix. */}
                <h3 className="m-0 mb-2 tracking-tight">{title}</h3>
                <p className="muted m-0">{copy}</p>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section className="grid cards mt-6" aria-label="Role dashboards">
        <RoleCard href="/renter" title="Renter" testId="role-renter-card" copy="Create a bounded mandate and prepare synthetic application packets." />
        <RoleCard href="/provider" title="Provider" testId="role-provider-card" copy="Publish listings, reserve applications, and verify Sui receipts." />
        <RoleCard href="/landlord" title="Landlord" testId="role-landlord-card" copy="Review accepted receipts and request document access." />
      </section>
    </main>
  );
}

function RoleCard({ href, title, copy, testId }: { href: string; title: string; copy: string; testId: string }) {
  // Card only renders a <div>; this needs to stay a single clickable <Link>, so the
  // legacy .card geometry is reproduced here directly instead of via <Card>.
  return (
    <Link
      href={href}
      className="rounded-[var(--radius)] border border-solid border-line bg-panel p-5 shadow-[var(--shadow)] text-inherit!"
      data-testid={testId}
    >
      <p className="eyebrow mb-2">{title}</p>
      {/* RD-219 U3b: reproduces legacy `.card h2 { margin: 0 0 8px; letter-spacing: -.025em }`
          (globals.css:133) — this Link reproduces `.card` geometry directly (see the comment
          above), so it doesn't inherit the <Card> primitive's fix either. */}
      <h2 className="m-0 mb-2 tracking-tight">{title} dashboard</h2>
      <p className="muted">{copy}</p>
      <span>Open {title.toLowerCase()} flow</span>
    </Link>
  );
}
