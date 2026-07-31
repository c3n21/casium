"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListingForm } from "@/components/ListingForm";
import { ApplicationInbox, type ReservedApplication } from "@/components/ApplicationInbox";
import { Button } from "@/components/ui/button";
import {
  EXPLORER_OBJECT,
  EXPLORER_TX,
  SMOKE,
  LIVE_AGENT_RUN,
} from "@casium/contracts-config";
import { MUNICIPALITIES, MUNICIPALITY_LABELS } from "@casium/shared";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

// The demo-ineligible municipality (code 6) must still render with the "(ineligible demo)"
// suffix that apps/e2e/specs/provider-dashboard.spec.ts asserts on; the shared constant's
// label is deliberately plain ("Porto"), so the suffix is derived here at the render site.
function municipalityLabel(code: number): string {
  const base = MUNICIPALITY_LABELS[code as keyof typeof MUNICIPALITY_LABELS] ?? `Code ${code}`;
  return code === MUNICIPALITIES.PORTO_INELIGIBLE_DEMO ? `${base} (ineligible demo)` : base;
}

type ProviderListing = {
  id: string;
  listingObjectId: string;
  externalListingId: string;
  municipalityCode: number;
  monthlyRentEur: number;
  bedrooms: number;
  active: boolean;
};

export default function ProviderPage() {
  const [showForm, setShowForm] = useState(false);
  const [createdTx, setCreatedTx] = useState<string | null>(null);

  const {
    data: listingsResponse,
    isLoading: listingsLoading,
    error: listingsError,
    refetch: refetchListings,
  } = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const response = await fetch(`${PROVIDER_API}/listings`);
      if (!response.ok) throw new Error(`Failed to fetch listings: ${response.status}`);
      return response.json() as Promise<{ listings: ProviderListing[] }>;
    },
    refetchInterval: 15_000,
  });

  const listings: ProviderListing[] = listingsResponse?.listings ?? [];

  const {
    data: applicationsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const response = await fetch(`${PROVIDER_API}/applications`);
      if (!response.ok) throw new Error(`Failed to fetch applications: ${response.status}`);
      return response.json() as Promise<{ applications: ReservedApplication[] }>;
    },
    refetchInterval: 15_000,
  });

  const applications: ReservedApplication[] = applicationsResponse?.applications ?? [];

  return (
    <main className="page">
      <p className="eyebrow">Provider console</p>
      <h1 className="page-title">Provider Dashboard</h1>
      <p className="lede">
        Create listings, review applications with AgentKit uniqueness proof, and verify Sui receipts.
      </p>

      <section className="card mb-8">
        <div className="split">
          <h2 className="m-0">Listings</h2>
          <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "+ New listing"}
          </Button>
        </div>

        {showForm && (
          <div className="mt-4">
            <ListingForm
              onCreated={(_id, tx) => {
                setCreatedTx(tx);
                setShowForm(false);
                void refetchListings();
              }}
            />
          </div>
        )}

        {createdTx && (
          <p className="alert success mt-2">
            Listing created.{" "}
            <a href={EXPLORER_TX(createdTx)} target="_blank" rel="noreferrer">
              View tx
            </a>
          </p>
        )}

        <div className="table-shell mt-4">
          <table className="text-sm">
            <thead>
              <tr>
                {["ID", "Object", "Municipality", "Rent", "Bedrooms", "Status"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listingsLoading && (
                <tr>
                  <td colSpan={6}>
                    Loading listings…
                  </td>
                </tr>
              )}
              {listingsError && (
                <tr>
                  <td className="text-red" colSpan={6}>
                    Error loading listings:{" "}
                    {listingsError instanceof Error ? listingsError.message : "unknown"}
                  </td>
                </tr>
              )}
              {!listingsLoading && !listingsError && listings.length === 0 && (
                <tr>
                  <td className="text-muted-ink" colSpan={6} data-testid="listings-empty">
                    No listings yet.
                  </td>
                </tr>
              )}
              {listings.map((listing) => {
                const ineligible = listing.municipalityCode === MUNICIPALITIES.PORTO_INELIGIBLE_DEMO;
                return (
                  <tr key={listing.id} data-testid={`listing-row-${listing.id}`}>
                    <td>{listing.id}</td>
                    <td>
                      <a href={EXPLORER_OBJECT(listing.listingObjectId)} target="_blank" rel="noreferrer">
                        <code className={ineligible ? "text-faint" : undefined}>
                          {listing.listingObjectId.slice(0, 6)}…
                        </code>
                      </a>
                    </td>
                    <td>
                      {municipalityLabel(listing.municipalityCode)}
                    </td>
                    <td>€{listing.monthlyRentEur}</td>
                    <td>{listing.bedrooms}</td>
                    <td>
                      {!listing.active ? (
                        <span className="badge neutral" data-testid="listing-status" data-status="inactive">Inactive</span>
                      ) : ineligible ? (
                        <span className="badge warn" data-testid="listing-status" data-status="ineligible">Ineligible</span>
                      ) : (
                        <span className="badge success" data-testid="listing-status" data-status="active">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Applications</h2>
        <p className="muted text-[0.9rem] mt-0">
          Each application shows World AgentKit human hash (uniqueness proof) and Sui receipt verification.
        </p>

        {isLoading && <p className="text-muted-ink">Loading applications…</p>}
        {error && (
          <p className="text-red">
            Error loading applications: {error instanceof Error ? error.message : "unknown"}
          </p>
        )}
        {!isLoading && !error && (
          <ApplicationInbox role="provider" applications={applications} onRefetch={() => void refetch()} />
        )}

        <details className="evidence-panel mt-8" data-testid="developer-evidence">
          <summary className="text-[0.85rem]">
            Demo evidence (known testnet receipts)
          </summary>
          <div className="mt-2 text-[0.85rem] text-muted-ink">
            <p className="mx-0 mt-0 mb-1">
              Smoke receipt:{" "}
              <a href={EXPLORER_OBJECT(SMOKE.receiptId)} target="_blank" rel="noreferrer">
                <code>{SMOKE.receiptId.slice(0, 20)}…</code>
              </a>
            </p>
            <p className="mx-0 mt-0 mb-1">
              Live agent receipt:{" "}
              <a href={EXPLORER_OBJECT(LIVE_AGENT_RUN.receiptId)} target="_blank" rel="noreferrer">
                <code>{LIVE_AGENT_RUN.receiptId.slice(0, 20)}…</code>
              </a>
            </p>
            <p className="m-0">
              Live agent tx:{" "}
              <a href={EXPLORER_TX(LIVE_AGENT_RUN.submitApplicationTxDigest)} target="_blank" rel="noreferrer">
                <code>{LIVE_AGENT_RUN.submitApplicationTxDigest}</code>
              </a>
            </p>
          </div>
        </details>
      </section>
    </main>
  );
}
