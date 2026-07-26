import Link from "next/link";

const navItems = [
  { href: "/", label: "Home", testId: "nav-home" },
  { href: "/renter", label: "Renter", testId: "nav-renter" },
  { href: "/agent", label: "Agent", testId: "nav-agent" },
  { href: "/provider", label: "Provider", testId: "nav-provider" },
  { href: "/landlord", label: "Landlord", testId: "nav-landlord" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand" data-testid="home-title" aria-label="Casium home">
          <span className="brand-mark">C</span>
          <span>Casium</span>
        </Link>
        <nav className="nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} data-testid={item.testId}>
              {item.label}
            </Link>
          ))}
          <span className="env-pill" data-testid="environment-badge">Testnet demo</span>
        </nav>
      </header>
      {children}
    </div>
  );
}
