"use client";

import { useState, useEffect, useCallback } from "react";
import { MandateForm } from "@/components/MandateForm";
import { MandateStatus } from "@/components/MandateStatus";
import { RevokeButton } from "@/components/RevokeButton";
import { PacketBuilder } from "@/components/PacketBuilder";
import { WithdrawButton } from "@/components/WithdrawButton";
import { Button } from "@/components/ui/button";
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

  if (loading) return <p className="text-muted-ink">Loading applications…</p>;
  if (error) return <p className="text-red">Error fetching applications: {error}</p>;
  if (!applications.length) return <p className="text-muted-ink">No submitted applications yet.</p>;

  return (
    <div>
      {applications.map((app) => (
        <div
          key={app.id}
          className="mb-3 p-3 border border-solid border-line rounded-[6px] text-[0.9rem]"
        >
          <div className="split">
            <div>
              <code className="text-[0.8rem]">{app.id}</code>
              <span
                className={`ml-2 ${
                  app.status === "accepted"
                    ? "badge success"
                    : app.status === "withdrawn"
                      ? "badge neutral"
                      : "badge warn"
                }`}
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
            <p className="mx-0 mt-1 mb-0 text-muted-ink">
              Listing:{" "}
              <a href={EXPLORER_OBJECT(app.listingObjectId)} target="_blank" rel="noreferrer">
                <code>{app.listingObjectId.slice(0, 20)}…</code>
              </a>
            </p>
          )}
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={fetchApplications}>
        Refresh
      </Button>
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
  const [listingsError, setListingsError] = useState<string | null>(null);
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
    setListingsError(null);
    fetch(`${PROVIDER_API}/listings`)
      .then((r) => {
        if (!r.ok) throw new Error(`Provider returned ${r.status}`);
        return r.json();
      })
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
      .catch((err: unknown) => {
        setListingsError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  // The mandateId to register a packet against.
  // Priority: URL param (agent handoff) > active mandate > none.
  // SMOKE.mandateId is NOT a fallback here.
  const packetMandateId: string | null = queryMandateId ?? mandate?.mandateId ?? null;
  const canBuildPackets = Boolean(packetMandateId);

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

      {!canBuildPackets ? (
        <section className="step-card">
          <span className="step-num">1</span>
          <div>
          {revoked && (
            <div className="alert success mb-4">
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
              {mandate ? (
                <>
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
                </>
              ) : (
                <>
                  <h2>Mandate from agent handoff</h2>
                  <p className="muted">
                    Upload packets for this mandate, then return to the agent run.
                  </p>
                  <p>
                    Mandate: <code>{packetMandateId}</code>
                  </p>
                </>
              )}
            </div>
          </section>

          {mandate && (
            <section className="step-card">
              <span className="step-num">2</span>
              <div>
                <h2>Your submitted applications</h2>
                <ApplicationsSection mandateId={mandate.mandateId} ownerCapId={mandate.ownerCapId} />
              </div>
            </section>
          )}

          {!revoked && packetMandateId && (
            <section className="step-card" data-testid="renter-step-listings">
              <span className="step-num">{mandate ? "3" : "2"}</span>
              <div>
                <h2 className="mb-2">Select target listings</h2>
                <p className="muted text-[0.9rem] mt-0">
                  Agent will evaluate each selected listing and apply only where eligible.
                </p>

              {listingsError ? (
                <p role="alert" className="alert error">Error loading listings: {listingsError}</p>
              ) : listings.length === 0 ? (
                <p className="faint">Loading listings…</p>
              ) : (
                <div className="listing-grid mb-4">
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
                <div className="mt-2">
                  <div className="alert mb-4">
                    <strong>Batch run setup.</strong> Create one encrypted packet per selected listing.
                    The agent run will evaluate the selected batch and apply only where the mandate allows.
                  </div>

                  <div className="card mb-6" data-testid="packet-batch-card">
                    <div className="cluster mb-4">
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
                        <h3 className="mt-0">Packet for {nextPacketListing.externalListingId}</h3>
                        <p className="muted mt-0">
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
                        <div className="stack mt-4">
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
                        <p data-testid="privacy-confirmation" className="mb-0 mt-2">
                          Only ciphertext was uploaded. Plaintext never sent to provider API.
                        </p>
                      </div>
                    )}
                  </div>

                  {packetResults.size === selectedListings.length ? (
                    <p className="mt-2">
                        <a
                          href={`/agent?mandateId=${encodeURIComponent(packetMandateId)}`}
                          data-testid="start-agent-run-link"
                          className="btn"
                        >
                          Run agent on selected listings →
                        </a>
                    </p>
                  ) : packetResults.size > 0 ? (
                    <p className="muted mt-2" data-testid="batch-run-disabled">
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
      <details className="evidence-panel mt-10" data-testid="developer-evidence">
        <summary className="text-[0.85rem]">
          Archived evidence (known testnet objects)
        </summary>
        <div
          className="mt-2 p-3 border border-solid border-line rounded text-[0.85rem] text-muted-ink bg-paper-2"
        >
          <p className="mx-0 mt-0 mb-1.5 text-amber">
            <strong>Note:</strong> These smoke objects predate agent EVM binding (RD-164).
            Their <code>agent_evm</code> is <code>null</code> and will be rejected by the live
            provider with <code>MANDATE_EVM_MISMATCH</code>. Use them only to inspect on-chain state.
          </p>
          <p className="mx-0 mt-0 mb-1">
            Smoke mandate:{" "}
            <a href={EXPLORER_OBJECT(SMOKE.mandateId)} target="_blank" rel="noreferrer">
              <code>{SMOKE.mandateId.slice(0, 20)}…</code>
            </a>
          </p>
          <p className="mx-0 mt-0 mb-1">
            OwnerCap:{" "}
            <a href={EXPLORER_OBJECT(SMOKE.ownerCapId)} target="_blank" rel="noreferrer">
              <code>{SMOKE.ownerCapId.slice(0, 20)}…</code>
            </a>
          </p>
          <p className="m-0">
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
