"use client";

import { useState, useEffect, useCallback } from "react";
import { MandateForm } from "@/components/MandateForm";
import { MandateStatus } from "@/components/MandateStatus";
import { RevokeButton } from "@/components/RevokeButton";
import { PacketBuilder } from "@/components/PacketBuilder";
import { WithdrawButton } from "@/components/WithdrawButton";
import { SMOKE, EXPLORER_OBJECT } from "@casium/contracts-config";
import { demoSession, type StoredListing } from "@/lib/demoSession";
import { EXPLORER_TX } from "@/lib/constants";

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

type ProviderListing = {
  id: string;
  listingObjectId: string;
  externalListingId: string;
  municipalityCode: number;
  monthlyRentEur: number;
  bedrooms: number;
  active: boolean;
};

type PacketCompleteResult = { walrusBlobId: string; packetHash: string; sizeBytes: number };

const MUNICIPALITY_LABELS: Record<number, string> = {
  1: "Lisbon",
  2: "Oeiras",
  3: "Cascais",
  4: "Amadora",
  5: "Almada",
  6: "Porto (ineligible)",
};

/** Handoff shape written to localStorage for the `/agent` page. */
function toStoredListing(listing: ProviderListing): StoredListing {
  return {
    providerListingId: listing.id,
    listingObjectId: listing.listingObjectId,
    externalListingId: listing.externalListingId,
  };
}

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
  // mandateId supplied via URL when arriving from the agent's "no packet" error link.
  const [queryMandateId, setQueryMandateId] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [revokeTxDigest, setRevokeTxDigest] = useState<string | null>(null);

  // Multi-listing state
  const [listings, setListings] = useState<ProviderListing[]>([]);
  const [selectedListings, setSelectedListings] = useState<ProviderListing[]>([]);
  const [packetResults, setPacketResults] = useState<Map<string, PacketCompleteResult>>(new Map());

  // On mount: read URL param and restore mandate from localStorage (SSR-safe).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("mandateId");
    setQueryMandateId(fromUrl);

    const stored = demoSession.loadMandate();
    if (stored) {
      setMandate(stored);
    }
  }, []);

  // Fetch provider listings and restore any saved selections.
  useEffect(() => {
    fetch(`${PROVIDER_API}/listings`)
      .then((r) => r.json())
      .then((data: { listings?: ProviderListing[] }) => {
        const fetched = data.listings ?? [];
        setListings(fetched);
        // Restore previously selected listings by matching stored IDs.
        const stored = demoSession.loadListings();
        if (stored.length > 0) {
          const storedIds = new Set(stored.map((s) => s.providerListingId));
          setSelectedListings(fetched.filter((l) => storedIds.has(l.id)));
        }
      })
      .catch(() => {
        // Non-fatal: listing selector stays empty.
      });
  }, []);

  // The mandateId to register a packet against.
  // Priority: URL param (agent handoff) > active mandate > none.
  // SMOKE.mandateId is NOT a fallback here.
  const packetMandateId: string | null = queryMandateId ?? mandate?.mandateId ?? null;

  function handleMandateCreated(created: MandateRecord) {
    demoSession.saveMandate(created);
    setMandate(created);
    setRevoked(false);
  }

  function handleRevoked(txDigest: string) {
    demoSession.clearMandate();
    demoSession.clearPacket();
    demoSession.clearListings();
    setMandate(null);
    setQueryMandateId(null);
    setRevokeTxDigest(txDigest);
    setRevoked(true);
    setSelectedListings([]);
    setPacketResults(new Map());
  }

  function handleStartOver() {
    demoSession.clearMandate();
    demoSession.clearPacket();
    demoSession.clearListings();
    setMandate(null);
    setQueryMandateId(null);
    setRevoked(false);
    setRevokeTxDigest(null);
    setSelectedListings([]);
    setPacketResults(new Map());
  }

  function toggleListing(listing: ProviderListing, checked: boolean) {
    setSelectedListings((prev) => {
      const next = checked ? [...prev, listing] : prev.filter((l) => l.id !== listing.id);
      demoSession.saveListings(next.map(toStoredListing));
      return next;
    });
  }

  return (
    <main style={{ maxWidth: 680, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ margin: 0 }}>Renter Dashboard</h1>
        {mandate && !revoked && (
          <button
            onClick={handleStartOver}
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
            Start over
          </button>
        )}
      </div>
      <p style={{ color: "#64748b" }}>
        Create a mandate scoped to your requirements. Your agent will only be able to apply within these limits.
      </p>

      {!mandate ? (
        <div>
          {revoked && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                border: "1px solid #bbf7d0",
                borderRadius: 6,
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "0.9rem",
              }}
            >
              Mandate revoked.{" "}
              {revokeTxDigest && (
                <>
                  <a href={EXPLORER_TX(revokeTxDigest)} target="_blank" rel="noreferrer">
                    View tx
                  </a>
                  {" — "}
                </>
              )}
              Create a new mandate to continue.
            </div>
          )}
          {!revoked && (
            <p style={{ color: "#64748b" }}>No mandate created yet. Create one below to get started.</p>
          )}
          <MandateForm onCreated={handleMandateCreated} />
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
              onRevoked={handleRevoked}
            />
          )}

          <hr style={{ margin: "1.5rem 0", borderColor: "#e2e8f0" }} />

          <h2 style={{ marginBottom: "0.75rem" }}>Your submitted applications</h2>
          <ApplicationsSection
            mandateId={mandate.mandateId}
            ownerCapId={mandate.ownerCapId}
          />

          {!revoked && packetMandateId && (
            <>
              <hr style={{ margin: "1.5rem 0", borderColor: "#e2e8f0" }} />

              <h2 style={{ marginBottom: "0.5rem" }}>Select target listings</h2>
              <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 0 }}>
                Agent will evaluate each selected listing and apply only where eligible.
              </p>

              {listings.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>Loading listings…</p>
              ) : (
                <div style={{ marginBottom: "1rem" }}>
                  {listings
                    .filter((l) => l.active)
                    .map((listing) => (
                      <div key={listing.id} style={{ marginBottom: "0.4rem" }}>
                        <label
                          style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedListings.some((s) => s.id === listing.id)}
                            onChange={(e) => toggleListing(listing, e.target.checked)}
                          />
                          <span>
                            {listing.externalListingId}
                            {" — "}
                            {MUNICIPALITY_LABELS[listing.municipalityCode] ??
                              `Code ${listing.municipalityCode}`}
                            {" — "}
                            €{listing.monthlyRentEur}/mo
                            {" — "}
                            {listing.bedrooms}bd
                          </span>
                        </label>
                      </div>
                    ))}
                </div>
              )}

              {selectedListings.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  {selectedListings.map((listing) => {
                    const uploaded = packetResults.has(listing.id);
                    return (
                      <div
                        key={listing.id}
                        style={{
                          marginBottom: "1.5rem",
                          padding: "0.75rem",
                          border: "1px solid #e2e8f0",
                          borderRadius: 6,
                        }}
                      >
                        <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
                          {listing.externalListingId}{" "}
                          {uploaded ? (
                            <span style={{ color: "#16a34a", fontWeight: 400 }}>
                              — packet uploaded ✓
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                              — no packet yet
                            </span>
                          )}
                        </p>
                        <PacketBuilder
                          mandateId={packetMandateId}
                          listingObjectId={listing.listingObjectId}
                          providerListingId={listing.id}
                          onComplete={(result) => {
                            setPacketResults((prev) => new Map(prev).set(listing.id, result));
                            // Keep backward-compat lastPacketMandateId so agent page
                            // still resolves the mandate via priority-2 source.
                            demoSession.savePacket(
                              packetMandateId,
                              result.walrusBlobId,
                              result.packetHash,
                            );
                            // Persist the full listing selection so agent page picks it up.
                            demoSession.saveListings(selectedListings.map(toStoredListing));
                          }}
                        />
                      </div>
                    );
                  })}

                  {packetResults.size > 0 && (
                    <p style={{ marginTop: "0.5rem" }}>
                      <a
                        href={`/agent?mandateId=${encodeURIComponent(packetMandateId)}`}
                        style={{ fontWeight: 600, fontSize: "1rem" }}
                      >
                        Start agent run →
                      </a>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Archived evidence ── */}
      <details style={{ marginTop: "2.5rem" }}>
        <summary style={{ cursor: "pointer", color: "#64748b", fontSize: "0.85rem" }}>
          Archived evidence (known testnet objects)
        </summary>
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem",
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            fontSize: "0.85rem",
            color: "#64748b",
            background: "#f8fafc",
          }}
        >
          <p style={{ margin: "0 0 6px", color: "#92400e" }}>
            <strong>Note:</strong> These smoke objects predate agent EVM binding (RD-164).
            Their <code>agent_evm</code> is <code>null</code> and will be rejected by the live
            provider with <code>MANDATE_EVM_MISMATCH</code>. Use them only to inspect on-chain state.
          </p>
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
    </main>
  );
}
