"use client";

import { useCurrentClient } from "@mysten/dapp-kit-react";
import { createCasiumClient } from "@casium/sui-client";
import { useQuery } from "@tanstack/react-query";
import { EXPLORER_OBJECT, EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";

type MandateStatusProps = {
  mandateId: string;
  ownerCapId?: string;
  agentCapId?: string;
  createTxDigest?: string;
};

export function MandateStatus({ mandateId, ownerCapId, agentCapId, createTxDigest }: MandateStatusProps) {
  const suiClient = useCurrentClient();

  const { data: mandate, isLoading, error } = useQuery({
    queryKey: ["mandate", "testnet", mandateId],
    queryFn: async () => {
      const client = createCasiumClient(
        { network: "testnet", rpcUrl: "https://fullnode.testnet.sui.io:443", packageId: PACKAGE_ID },
        suiClient,
      );
      return client.getMandate(mandateId);
    },
    enabled: Boolean(mandateId),
    refetchInterval: 10_000,
  });

  if (!mandateId) return null;

  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", marginTop: "1.5rem" }}>
      <h3 style={{ marginTop: 0 }}>Mandate</h3>

      {isLoading && <p style={{ color: "#64748b" }}>Loading mandate from testnet…</p>}
      {error && <p style={{ color: "#dc2626" }}>Error reading mandate: {error instanceof Error ? error.message : "unknown"}</p>}

      {mandate && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <tbody>
            <Row label="Object ID" value={<ObjectLink id={mandateId} />} />
            <Row label="Status" value={mandate.revoked ? "⛔ Revoked" : "✅ Active"} />
            <Row label="Remaining applications" value={String(mandate.remainingApplications)} />
            <Row label="Max rent" value={`€${mandate.maxMonthlyRentEur} / month`} />
            <Row label="Min bedrooms" value={String(mandate.minBedrooms)} />
            <Row label="Agent Sui address" value={<code style={{ wordBreak: "break-all" }}>{mandate.agentSui}</code>} />
            {ownerCapId && <Row label="OwnerCap" value={<ObjectLink id={ownerCapId} />} />}
            {agentCapId && <Row label="AgentCap" value={<ObjectLink id={agentCapId} />} />}
            {createTxDigest && <Row label="Create tx" value={<TxLink digest={createTxDigest} />} />}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, paddingBottom: 8, paddingRight: 16, whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ paddingBottom: 8, wordBreak: "break-all" }}>{value}</td>
    </tr>
  );
}

function ObjectLink({ id }: { id: string }) {
  return (
    <a href={EXPLORER_OBJECT(id)} target="_blank" rel="noreferrer">
      <code style={{ fontSize: "0.8rem" }}>{id.slice(0, 16)}…</code>
    </a>
  );
}

function TxLink({ digest }: { digest: string }) {
  return (
    <a href={EXPLORER_TX(digest)} target="_blank" rel="noreferrer">
      <code style={{ fontSize: "0.8rem" }}>{digest.slice(0, 16)}…</code>
    </a>
  );
}
