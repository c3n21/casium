"use client";

import { useState } from "react";
import { EXPLORER_TX, EXPLORER_OBJECT } from "@/lib/constants";

const PROVIDER_API_BASE = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

export type ReservedApplication = {
  id: string;
  listingId: string;
  listingObjectId: string;
  providerSuiAddress: string;
  landlordSuiAddress: string;
  mandateId: string;
  agentSuiAddress: string;
  agentEvmAddress: string;
  humanIdHash: string;
  walrusBlobId: string;
  packetHash: string;
  status: "reserved" | "accepted" | "withdrawn";
  idempotencyKey: string;
  receipt?: { receiptId: string; txDigest: string };
};

type ApplicationInboxProps = {
  applications: ReservedApplication[];
  onRefetch?: () => void;
};

export function ApplicationInbox({ applications, onRefetch }: ApplicationInboxProps) {
  const [verifyInputs, setVerifyInputs] = useState<Record<string, { txDigest: string; receiptId: string }>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});

  async function handleVerify(appId: string) {
    const input = verifyInputs[appId];
    if (!input?.txDigest || !input?.receiptId) return;
    setVerifying(appId);
    setVerifyErrors((e) => ({ ...e, [appId]: "" }));

    try {
      const res = await fetch(`${PROVIDER_API_BASE}/applications/${appId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: appId, txDigest: input.txDigest, receiptId: input.receiptId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        setVerifyErrors((e) => ({ ...e, [appId]: body.error }));
      } else {
        onRefetch?.();
      }
    } catch (err) {
      setVerifyErrors((e) => ({ ...e, [appId]: err instanceof Error ? err.message : "Network error" }));
    } finally {
      setVerifying(null);
    }
  }

  if (applications.length === 0) {
    return <p style={{ color: "#64748b" }}>No applications yet. The agent will populate this once it submits.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {applications.map((a) => (
        <div key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>{a.id}</strong>
            <StatusBadge status={a.status} />
          </div>

          {a.mandateId && (
            <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "#64748b" }}>
              Mandate:{" "}
              <a href={EXPLORER_OBJECT(a.mandateId)} target="_blank" rel="noreferrer">
                <code>{a.mandateId.slice(0, 16)}…</code>
              </a>{" "}
              | Blob: <code>{a.walrusBlobId.slice(0, 20)}…</code> | Human:{" "}
              <code>{a.humanIdHash.slice(0, 18)}…</code>
            </p>
          )}

          {a.status === "reserved" && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "#2563eb" }}>Verify Sui receipt</summary>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  type="text"
                  placeholder="tx digest"
                  value={verifyInputs[a.id]?.txDigest ?? ""}
                  onChange={(e) =>
                    setVerifyInputs((v) => ({ ...v, [a.id]: { ...v[a.id], txDigest: e.target.value } }))
                  }
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="receipt object ID (0x...)"
                  value={verifyInputs[a.id]?.receiptId ?? ""}
                  onChange={(e) =>
                    setVerifyInputs((v) => ({ ...v, [a.id]: { ...v[a.id], receiptId: e.target.value } }))
                  }
                  style={inputStyle}
                />
                {verifyErrors[a.id] && (
                  <p style={{ color: "#dc2626", margin: 0, fontSize: "0.85rem" }}>{verifyErrors[a.id]}</p>
                )}
                <button onClick={() => handleVerify(a.id)} disabled={verifying === a.id} style={buttonStyle}>
                  {verifying === a.id ? "Verifying…" : "Verify"}
                </button>
              </div>
            </details>
          )}

          {a.receipt && (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem" }}>
              ✅ Receipt:{" "}
              <a href={EXPLORER_OBJECT(a.receipt.receiptId)} target="_blank" rel="noreferrer">
                <code>{a.receipt.receiptId.slice(0, 16)}…</code>
              </a>{" "}
              ·{" "}
              <a href={EXPLORER_TX(a.receipt.txDigest)} target="_blank" rel="noreferrer">
                view tx
              </a>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    reserved: "#f59e0b",
    accepted: "#16a34a",
    withdrawn: "#94a3b8",
  };
  return (
    <span
      style={{
        background: colors[status] ?? "#94a3b8",
        color: "#fff",
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: "0.8rem",
      }}
    >
      {status}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  fontSize: "inherit",
  width: "100%",
};
const buttonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "inherit",
};
