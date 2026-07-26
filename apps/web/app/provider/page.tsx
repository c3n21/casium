"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListingForm } from "@/components/ListingForm";
import { ApplicationInbox, type ReservedApplication } from "@/components/ApplicationInbox";
import {
  EXPLORER_OBJECT,
  EXPLORER_TX,
  SMOKE,
  LIVE_AGENT_RUN,
} from "@casium/contracts-config";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

const MUNICIPALITY_LABELS: Record<number, string> = {
  1: "Lisbon",
  2: "Oeiras",
  3: "Cascais",
  4: "Amadora",
  5: "Almada",
  6: "Porto (ineligible demo)",
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
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Provider Dashboard</h1>
      <p style={{ color: "#64748b" }}>
        Create listings, review applications with AgentKit uniqueness proof, and verify Sui receipts.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Listings</h2>
          <button onClick={() => setShowForm((v) => !v)} style={secondaryBtn}>
            {showForm ? "Close" : "+ New listing"}
          </button>
        </div>

        {showForm && (
          <div style={{ marginTop: "1rem" }}>
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
          <p style={{ marginTop: 8 }}>
            ✅ Listing created.{" "}
            <a href={EXPLORER_TX(createdTx)} target="_blank" rel="noreferrer">
              View tx
            </a>
          </p>
        )}

        <div style={{ marginTop: "1rem", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {["ID", "Object", "Municipality", "Rent", "Bedrooms", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid #e2e8f0" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listingsLoading && (
                <tr>
                  <td style={td} colSpan={6}>
                    Loading listings…
                  </td>
                </tr>
              )}
              {listingsError && (
                <tr>
                  <td style={{ ...td, color: "#dc2626" }} colSpan={6}>
                    Error loading listings:{" "}
                    {listingsError instanceof Error ? listingsError.message : "unknown"}
                  </td>
                </tr>
              )}
              {!listingsLoading && !listingsError && listings.length === 0 && (
                <tr>
                  <td style={{ ...td, color: "#64748b" }} colSpan={6}>
                    No listings yet.
                  </td>
                </tr>
              )}
              {listings.map((listing) => {
                const ineligible = listing.municipalityCode === 6;
                return (
                  <tr key={listing.id}>
                    <td style={td}>{listing.id}</td>
                    <td style={td}>
                      <a href={EXPLORER_OBJECT(listing.listingObjectId)} target="_blank" rel="noreferrer">
                        <code style={ineligible ? { color: "#94a3b8" } : undefined}>
                          {listing.listingObjectId.slice(0, 6)}…
                        </code>
                      </a>
                    </td>
                    <td style={td}>
                      {MUNICIPALITY_LABELS[listing.municipalityCode] ?? `Code ${listing.municipalityCode}`}
                    </td>
                    <td style={td}>€{listing.monthlyRentEur}</td>
                    <td style={td}>{listing.bedrooms}</td>
                    <td style={td}>
                      {!listing.active ? (
                        <span style={{ color: "#94a3b8" }}>Inactive</span>
                      ) : ineligible ? (
                        <span style={{ color: "#f59e0b" }}>Ineligible</span>
                      ) : (
                        <span style={{ color: "#16a34a" }}>Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Applications</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 0 }}>
          Each application shows World AgentKit human hash (uniqueness proof) and Sui receipt verification.
        </p>

        {isLoading && <p style={{ color: "#64748b" }}>Loading applications…</p>}
        {error && (
          <p style={{ color: "#dc2626" }}>
            Error loading applications: {error instanceof Error ? error.message : "unknown"}
          </p>
        )}
        {!isLoading && !error && (
          <ApplicationInbox applications={applications} onRefetch={() => void refetch()} />
        )}

        <details style={{ marginTop: "2rem" }}>
          <summary style={{ cursor: "pointer", color: "#64748b", fontSize: "0.85rem" }}>
            Demo evidence (known testnet receipts)
          </summary>
          <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#64748b" }}>
            <p style={{ margin: "0 0 4px" }}>
              Smoke receipt:{" "}
              <a href={EXPLORER_OBJECT(SMOKE.receiptId)} target="_blank" rel="noreferrer">
                <code>{SMOKE.receiptId.slice(0, 20)}…</code>
              </a>
            </p>
            <p style={{ margin: "0 0 4px" }}>
              Live agent receipt:{" "}
              <a href={EXPLORER_OBJECT(LIVE_AGENT_RUN.receiptId)} target="_blank" rel="noreferrer">
                <code>{LIVE_AGENT_RUN.receiptId.slice(0, 20)}…</code>
              </a>
            </p>
            <p style={{ margin: 0 }}>
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

const secondaryBtn: React.CSSProperties = {
  padding: "0.5rem 1rem",
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: "inherit",
};
const td: React.CSSProperties = { padding: "0.6rem 0.75rem", borderBottom: "1px solid #e2e8f0" };
