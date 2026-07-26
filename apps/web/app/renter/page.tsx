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

  const nextPacketListing = selectedListings.find((listing) => !packetResults.has(listing.id));

  return (
    <main className="page narrow">
      <div className="split">
        <div>
          <p className="eyebrow">Renter flow</p>
          <h1 className="page-title">Set limits. Keep custody.</h1>
        </div>
        {mandate && !revoked && (
          <button
            onClick={handleStartOver}
            data-ui="secondary"
          >
            Start over
          </button>
        )}
      </div>
      <p className="lede">
        Create a mandate scoped to your requirements. Your agent will only be able to apply within these limits.
      </p>

      {!mandate ? (
        <section className="step-card">
          <span className="step-num">1</span>
          <div>
          {revoked && (
            <div className="alert success" style={{ marginBottom: "1rem" }}>
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
          {!revoked && <p className="muted">No mandate created yet. Create one below to get started.</p>}
          <MandateForm onCreated={handleMandateCreated} />
          </div>
        </section>
      ) : (
        <div className="stack">
          <section className="step-card">
            <span className="step-num">1</span>
            <div>
              <h2>Mandate is active</h2>
              <p className="muted">These limits are enforced by the Sui package before the agent can act.</p>
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
            </div>
          </section>

          <section className="step-card">
            <span className="step-num">2</span>
            <div>
              <h2>Your submitted applications</h2>
              <ApplicationsSection mandateId={mandate.mandateId} ownerCapId={mandate.ownerCapId} />
            </div>
          </section>

          {!revoked && packetMandateId && (
            <section className="step-card" data-testid="renter-step-listings">
              <span className="step-num">3</span>
              <div>
                <h2 style={{ marginBottom: "0.5rem" }}>Select target listings</h2>
                <p className="muted" style={{ fontSize: "0.9rem", marginTop: 0 }}>
                  Agent will evaluate each selected listing and apply only where eligible.
                </p>

              {listings.length === 0 ? (
                <p className="faint">Loading listings…</p>
              ) : (
                <div className="listing-grid" style={{ marginBottom: "1rem" }}>
                  {listings
                    .filter((l) => l.active)
                    .map((listing) => (
                      <div key={listing.id}>
                        <label
                          className="listing-option"
                        >
                          <input
                            type="checkbox"
                            data-testid={`target-checkbox-${listing.id}`}
                            checked={selectedListings.some((s) => s.id === listing.id)}
                            onChange={(e) => toggleListing(listing, e.target.checked)}
                          />
                          <span>
                            <strong>{listing.externalListingId}</strong>
                            <br />
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
                  <div className="alert" style={{ marginBottom: "1rem" }}>
                    <strong>Batch run setup.</strong> Create one encrypted packet per selected listing.
                    The agent run will evaluate the selected batch and apply only where the mandate allows.
                  </div>

                  <div className="card" data-testid="packet-batch-card" style={{ marginBottom: "1.5rem", boxShadow: "none" }}>
                    <div className="cluster" style={{ marginBottom: "1rem" }}>
                      {selectedListings.map((listing) => {
                        const uploaded = packetResults.has(listing.id);
                        const active = nextPacketListing?.id === listing.id;
                        return (
                          <span
                            key={listing.id}
                            className={uploaded ? "badge success" : active ? "badge info" : "badge neutral"}
                            data-testid={`packet-upload-status-${listing.id}`}
                          >
                            {listing.externalListingId}: {uploaded ? "packet uploaded" : active ? "ready to upload" : "waiting"}
                          </span>
                        );
                      })}
                    </div>

                    {nextPacketListing ? (
                      <div data-testid={`packet-card-${nextPacketListing.id}`}>
                        <h3 style={{ marginTop: 0 }}>Packet for {nextPacketListing.externalListingId}</h3>
                        <p className="muted" style={{ marginTop: 0 }}>
                          This single form is reused for each selected listing so the page stays focused.
                        </p>
                        <PacketBuilder
                          mandateId={packetMandateId}
                          listingObjectId={nextPacketListing.listingObjectId}
                          providerListingId={nextPacketListing.id}
                          showAgentRunLink={false}
                          onComplete={(result) => {
                            setPacketResults((prev) => new Map(prev).set(nextPacketListing.id, result));
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
                    ) : (
                      <div className="alert success" data-testid="all-packets-uploaded">
                        <strong>All selected listings have encrypted packets.</strong> You can start the batch agent run.
                        <div className="stack" style={{ marginTop: "1rem", gap: 8 }}>
                          {selectedListings.map((listing) => {
                            const result = packetResults.get(listing.id);
                            if (!result) return null;
                            return (
                              <div key={listing.id} data-testid={`packet-uploaded-${listing.id}`}>
                                <strong>{listing.externalListingId}</strong>: <code>{result.walrusBlobId}</code>
                                <br />
                                <span className="muted">Hash: <code>{result.packetHash}</code></span>
                              </div>
                            );
                          })}
                        </div>
                        <p data-testid="privacy-confirmation" style={{ marginBottom: 0, marginTop: 8 }}>
                          Only ciphertext was uploaded. Plaintext never sent to provider API.
                        </p>
                      </div>
                    )}
                  </div>

                  {packetResults.size === selectedListings.length ? (
                    <p style={{ marginTop: "0.5rem" }}>
                        <a
                          href={`/agent?mandateId=${encodeURIComponent(packetMandateId)}`}
                          data-testid="start-agent-run-link"
                          className="btn"
                        >
                          Run agent on selected listings →
                        </a>
                    </p>
                  ) : packetResults.size > 0 ? (
                    <p className="muted" data-testid="batch-run-disabled" style={{ marginTop: "0.5rem" }}>
                      Upload packets for all selected listings to continue.
                    </p>
                  ) : null}
                </div>
              )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Archived evidence ── */}
      <details className="evidence-panel" data-testid="developer-evidence" style={{ marginTop: "2.5rem" }}>
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
