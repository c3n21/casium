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
    <section className="card" data-testid="mandate-panel" style={{ marginTop: "1.5rem" }}>
      <div className="split">
        <div>
          <p className="eyebrow">On-chain permission rail</p>
          <h3 style={{ marginTop: 0 }}>Mandate</h3>
        </div>
        {mandate && (
          <span className={mandate.revoked ? "badge danger" : "badge success"} data-testid="mandate-status">
            {mandate.revoked ? "Revoked" : "Active"}
          </span>
        )}
      </div>

      {isLoading && <p style={{ color: "#64748b" }}>Loading mandate from testnet…</p>}
      {error && <p style={{ color: "#dc2626" }}>Error reading mandate: {error instanceof Error ? error.message : "unknown"}</p>}

      {mandate && (
        <div className="table-shell">
        <table style={{ fontSize: "0.9rem" }}>
          <tbody>
            <Row label="Object ID" value={<ObjectLink id={mandateId} />} />
            <Row label="Status" value={mandate.revoked ? "Revoked" : "Active"} />
            <Row label="Remaining applications" value={<span data-testid="mandate-remaining-apps">{mandate.remainingApplications}</span>} />
            <Row label="Max rent" value={<span data-testid="mandate-max-rent">€{mandate.maxMonthlyRentEur} / month</span>} />
            <Row label="Min bedrooms" value={String(mandate.minBedrooms)} />
            <Row label="Agent Sui address" value={<code style={{ wordBreak: "break-all" }}>{mandate.agentSui}</code>} />
            {ownerCapId && <Row label="OwnerCap" value={<ObjectLink id={ownerCapId} />} />}
            {agentCapId && <Row label="AgentCap" value={<ObjectLink id={agentCapId} />} />}
            {createTxDigest && <Row label="Create tx" value={<TxLink digest={createTxDigest} />} />}
          </tbody>
        </table>
        </div>
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
