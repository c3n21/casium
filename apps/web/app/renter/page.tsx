"use client";

import { useState, useEffect, useCallback } from "react";
import { MandateForm } from "@/components/MandateForm";
import { MandateStatus } from "@/components/MandateStatus";
import { RevokeButton } from "@/components/RevokeButton";
import { PacketBuilder } from "@/components/PacketBuilder";
import { WithdrawButton } from "@/components/WithdrawButton";
import { SMOKE, DEMO_LISTING_OBJECT_ID, EXPLORER_OBJECT } from "@rentdelegate/contracts-config";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

type MandateRecord = {
  mandateId: string;
  ownerCapId: string;
  agentCapId: string;
  txDigest: string;
};

type Application = {
  id: string;
  listingId: string;
  listingObjectId: string;
  mandateId: string;
  status: "reserved" | "accepted" | "withdrawn";
  walrusBlobId: string;
  receipt?: {
    receiptId: string;
    txDigest?: string;
  };
};

function ApplicationsSection({
  mandateId,
  ownerCapId,
}: {
  mandateId: string;
  ownerCapId: string;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${PROVIDER_API}/applications?mandateId=${encodeURIComponent(mandateId)}`);
      if (!res.ok) throw new Error(`Provider returned ${res.status}`);
      const data = (await res.json()) as { applications: Application[] };
      setApplications(data.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mandateId]);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  if (loading) return <p style={{ color: "#64748b" }}>Loading applications…</p>;
  if (error) return <p style={{ color: "#dc2626" }}>Error fetching applications: {error}</p>;
  if (!applications.length) return <p style={{ color: "#64748b" }}>No submitted applications yet.</p>;

  return (
    <div>
      {applications.map((app) => (
        <div
          key={app.id}
          style={{
            marginBottom: "0.75rem",
            padding: "0.75rem",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <code style={{ fontSize: "0.8rem" }}>{app.id}</code>
              <span
                style={{
                  marginLeft: "0.5rem",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 3,
                  fontSize: "0.75rem",
                  background:
                    app.status === "accepted"
                      ? "#dcfce7"
                      : app.status === "withdrawn"
                        ? "#f1f5f9"
                        : "#fef9c3",
                  color:
                    app.status === "accepted"
                      ? "#166534"
                      : app.status === "withdrawn"
                        ? "#64748b"
                        : "#713f12",
                }}
              >
                {app.status}
              </span>
            </div>
            {app.status === "accepted" && app.receipt?.receiptId && (
              <WithdrawButton
                applicationId={app.id}
                mandateId={mandateId}
                receiptId={app.receipt.receiptId}
                ownerCapId={ownerCapId}
                onWithdrawn={fetchApplications}
              />
            )}
          </div>
          {app.listingObjectId && (
            <p style={{ margin: "0.25rem 0 0", color: "#64748b" }}>
              Listing:{" "}
              <a href={EXPLORER_OBJECT(app.listingObjectId)} target="_blank" rel="noreferrer">
                <code>{app.listingObjectId.slice(0, 20)}…</code>
              </a>
            </p>
          )}
        </div>
      ))}
      <button
        onClick={fetchApplications}
        style={{
          padding: "0.3rem 0.75rem",
          background: "transparent",
          border: "1px solid #cbd5e1",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: "0.85rem",
          color: "#64748b",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

export default function RenterPage() {
  const [mandate, setMandate] = useState<MandateRecord | null>(null);
  const [revoked, setRevoked] = useState(false);

  return (
    <main style={{ maxWidth: 680, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Renter Dashboard</h1>
      <p style={{ color: "#64748b" }}>
        Create a mandate scoped to your requirements. Your agent will only be able to apply within these limits.
      </p>

      {!mandate ? (
        <div>
          <p style={{ color: "#64748b" }}>No mandate created yet. Create one below to get started.</p>
          <MandateForm onCreated={setMandate} />

          <details style={{ marginTop: "2rem" }}>
            <summary style={{ cursor: "pointer", color: "#64748b", fontSize: "0.85rem" }}>
              Demo evidence (known testnet objects)
            </summary>
            <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#64748b" }}>
              <p style={{ margin: "0 0 4px" }}>
                Smoke mandate:{" "}
                <a href={EXPLORER_OBJECT(SMOKE.mandateId)} target="_blank" rel="noreferrer">
                  <code>{SMOKE.mandateId.slice(0, 20)}…</code>
                </a>
              </p>
              <p style={{ margin: "0 0 4px" }}>
                OwnerCap:{" "}
                <a href={EXPLORER_OBJECT(SMOKE.ownerCapId)} target="_blank" rel="noreferrer">
                  <code>{SMOKE.ownerCapId.slice(0, 20)}…</code>
                </a>
              </p>
              <p style={{ margin: 0 }}>
                AgentCap:{" "}
                <a href={EXPLORER_OBJECT(SMOKE.agentCapId)} target="_blank" rel="noreferrer">
                  <code>{SMOKE.agentCapId.slice(0, 20)}…</code>
                </a>
              </p>
            </div>
          </details>
        </div>
      ) : (
        <>
          <MandateStatus
            mandateId={mandate.mandateId}
            ownerCapId={mandate.ownerCapId}
            agentCapId={mandate.agentCapId}
            createTxDigest={mandate.txDigest}
          />

          {mandate.ownerCapId && !revoked && (
            <RevokeButton
              mandateId={mandate.mandateId}
              ownerCapId={mandate.ownerCapId}
              onRevoked={() => setRevoked(true)}
            />
          )}

          <hr style={{ margin: "1.5rem 0", borderColor: "#e2e8f0" }} />

          <h2 style={{ marginBottom: "0.75rem" }}>Your submitted applications</h2>
          <ApplicationsSection
            mandateId={mandate.mandateId}
            ownerCapId={mandate.ownerCapId}
          />
        </>
      )}

      <hr style={{ margin: "2rem 0", borderColor: "#e2e8f0" }} />

      <h2>Upload Application Packet</h2>
      <p style={{ color: "#64748b" }}>Encrypt your synthetic document packet before the agent submits it.</p>
      <PacketBuilder mandateId={mandate?.mandateId ?? SMOKE.mandateId} listingObjectId={DEMO_LISTING_OBJECT_ID} />
    </main>
  );
}
