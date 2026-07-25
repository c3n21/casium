"use client";

import { useCurrentClient } from "@mysten/dapp-kit-react";
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { useQuery } from "@tanstack/react-query";
import { EXPLORER_OBJECT, EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";

const SMOKE_RECEIPT_ID = "0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20";

export default function LandlordPage() {
  const suiClient = useCurrentClient();

  const { data: receipt, isLoading, error } = useQuery({
    queryKey: ["receipt", SMOKE_RECEIPT_ID],
    queryFn: async () => {
      const client = createRentDelegateClient(
        { network: "testnet", rpcUrl: "https://fullnode.testnet.sui.io:443", packageId: PACKAGE_ID },
        suiClient,
      );
      return client.getReceipt(SMOKE_RECEIPT_ID);
    },
    refetchInterval: 30_000,
  });

  return (
    <main style={{ maxWidth: 680, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Landlord — Access Panel</h1>
      <p style={{ color: "#64748b" }}>
        Review verified Sui application receipts. The receipt proves the agent acted within mandate scope.
      </p>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Smoke receipt (testnet)</h2>
        <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
          Object: <a href={EXPLORER_OBJECT(SMOKE_RECEIPT_ID)} target="_blank" rel="noreferrer"><code>{SMOKE_RECEIPT_ID.slice(0, 20)}…</code></a>
        </p>

        {isLoading && <p style={{ color: "#64748b" }}>Loading receipt from testnet…</p>}
        {error && <p style={{ color: "#dc2626" }}>Error: {error instanceof Error ? error.message : "unknown"}</p>}

        {receipt && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <tbody>
              <Row label="Status" value={receipt.status === 1 ? "✅ Submitted" : receipt.status === 2 ? "Withdrawn" : String(receipt.status)} />
              <Row label="Mandate" value={<Link href={EXPLORER_OBJECT(receipt.mandateId)}><code>{receipt.mandateId.slice(0, 16)}…</code></Link>} />
              <Row label="Listing" value={<Link href={EXPLORER_OBJECT(receipt.listingId)}><code>{receipt.listingId.slice(0, 16)}…</code></Link>} />
              <Row label="Agent" value={<code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{receipt.agent}</code>} />
              <Row label="Provider" value={<code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{receipt.provider}</code>} />
              <Row label="Submitted" value={new Date(receipt.submittedAtMs).toISOString()} />
              <Row label="Access expires" value={new Date(receipt.accessExpiresAtMs).toISOString()} />
            </tbody>
          </table>
        )}

        <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#64748b" }}>
          Document access via Walrus + Seal is P2 scope. The receipt ID and access expiry are on-chain.
        </p>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, paddingBottom: 8, paddingRight: 16, whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ paddingBottom: 8 }}>{value}</td>
    </tr>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}
