import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Casium</h1>
      <p style={{ color: "#64748b", marginBottom: "2rem" }}>
        <em>World limits who the agent represents. Sui limits what the agent can do.</em>
      </p>
      <nav style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Link href="/renter" style={{ fontSize: "1.1rem" }}>
          Renter — create mandate, track applications
        </Link>
        <Link href="/provider" style={{ fontSize: "1.1rem" }}>
          Provider — manage listings, review applications
        </Link>
        <Link href="/landlord" style={{ fontSize: "1.1rem" }}>
          Landlord — verify receipts, access documents
        </Link>
      </nav>
    </main>
  );
}
