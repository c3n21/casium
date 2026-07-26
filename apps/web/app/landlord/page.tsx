"use client";

import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { createCasiumClient } from "@casium/sui-client";
import { useQuery } from "@tanstack/react-query";
import {
  EXPLORER_OBJECT,
  EXPLORER_TX,
  PACKAGE_ID,
  RPC_URL as RPC_URL_TESTNET,
  SMOKE,
  LIVE_AGENT_RUN,
} from "@casium/contracts-config";
import { ApplicationInbox, type ReservedApplication } from "@/components/ApplicationInbox";
import { PacketViewer } from "@/components/PacketViewer";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";
const SMOKE_RECEIPT_ID = SMOKE.receiptId;
const LIVE_RECEIPT_ID = LIVE_AGENT_RUN.receiptId;

export default function LandlordPage() {
  const suiClient = useCurrentClient();
  const account = useCurrentAccount();
  const connectedAddress = account?.address ?? null;

  // Fetch smoke receipt for the demo evidence panel
  const { data: smokeReceipt, isLoading: smokeLoading, error: smokeError } = useQuery({
    queryKey: ["receipt", SMOKE_RECEIPT_ID],
    queryFn: async () => {
      const client = createCasiumClient(
        { network: "testnet", rpcUrl: RPC_URL_TESTNET, packageId: PACKAGE_ID },
        suiClient,
      );
      return client.getReceipt(SMOKE_RECEIPT_ID);
    },
    refetchInterval: 30_000,
  });

  // Fetch live receipt for the demo evidence panel
  const { data: liveReceipt } = useQuery({
    queryKey: ["receipt", LIVE_RECEIPT_ID],
    queryFn: async () => {
      const client = createCasiumClient(
        { network: "testnet", rpcUrl: RPC_URL_TESTNET, packageId: PACKAGE_ID },
        suiClient,
      );
      return client.getReceipt(LIVE_RECEIPT_ID);
    },
    refetchInterval: 30_000,
  });

  // Fetch all applications and filter by connected landlord address
  const {
    data: applicationsResponse,
    isLoading: appsLoading,
    error: appsError,
    refetch,
  } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const response = await fetch(`${PROVIDER_API}/applications`);
      if (!response.ok) throw new Error(`Failed to fetch applications: ${response.status}`);
      return response.json() as Promise<{ applications: ReservedApplication[] }>;
    },
    refetchInterval: 15_000,
    enabled: connectedAddress !== null,
  });

  const landlordApplications: ReservedApplication[] = (applicationsResponse?.applications ?? []).filter(
    (a) => a.landlordSuiAddress.toLowerCase() === connectedAddress?.toLowerCase(),
  );

  return (
    <main className="page">
      <p className="eyebrow">Landlord review</p>
      <h1 className="page-title" data-testid="landlord-page-title">Landlord Access Panel</h1>
      <p className="lede">
        Review verified Sui application receipts. The receipt proves the agent acted within mandate scope.
      </p>

      {/* Live-data section: wallet-connected landlord view */}
      <section className="card" style={{ marginBottom: "2rem" }}>
        <h2>Your Applications</h2>
        {!connectedAddress ? (
          <p style={{ color: "#64748b" }}>Connect your wallet to see applications for your listings.</p>
        ) : (
          <>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: 0 }}>
              Showing applications where landlord address is{" "}
              <code style={{ fontSize: "0.8rem" }}>{connectedAddress.slice(0, 20)}…</code>
            </p>
            {appsLoading && <p style={{ color: "#64748b" }}>Loading applications…</p>}
            {appsError && (
              <p style={{ color: "#dc2626" }}>
                Error: {appsError instanceof Error ? appsError.message : "unknown"}
              </p>
            )}
            {!appsLoading && !appsError && (
              <ApplicationInbox applications={landlordApplications} onRefetch={() => void refetch()} />
            )}
          </>
        )}
      </section>

      {/* Demo evidence panel — explicitly labeled known testnet objects */}
      <details className="evidence-panel" data-testid="developer-evidence" style={{ marginTop: "1rem" }}>
        <summary data-testid="demo-evidence-summary" style={{ fontSize: "0.9rem" }}>
          Demo evidence (known testnet receipts)
        </summary>

        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Smoke receipt */}
          <section className="card" data-testid="receipt-panel-smoke" style={{ boxShadow: "none" }}>
            <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Smoke receipt (testnet)</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.5rem" }}>
              Object:{" "}
              <a href={EXPLORER_OBJECT(SMOKE_RECEIPT_ID)} target="_blank" rel="noreferrer">
                <code>{SMOKE_RECEIPT_ID.slice(0, 20)}…</code>
              </a>
            </p>

            {smokeLoading && <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading from testnet…</p>}
            {smokeError && (
              <p style={{ color: "#dc2626", fontSize: "0.85rem" }}>
                Error: {smokeError instanceof Error ? smokeError.message : "unknown"}
              </p>
            )}
            {smokeReceipt && <ReceiptTable receipt={smokeReceipt} />}
            {smokeReceipt && smokeReceipt.walrusBlobIdBytes.length > 0 && (
              <PacketViewer receipt={smokeReceipt} />
            )}
          </section>

          {/* Live agent receipt */}
          <section className="card" data-testid="receipt-panel-live" style={{ boxShadow: "none" }}>
            <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Live agent receipt (RD-108, testnet)</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.5rem" }}>
              Object:{" "}
              <a href={EXPLORER_OBJECT(LIVE_RECEIPT_ID)} target="_blank" rel="noreferrer">
                <code>{LIVE_RECEIPT_ID.slice(0, 20)}…</code>
              </a>{" "}
              · Tx:{" "}
              <a href={EXPLORER_TX(LIVE_AGENT_RUN.submitApplicationTxDigest)} target="_blank" rel="noreferrer">
                <code>{LIVE_AGENT_RUN.submitApplicationTxDigest}</code>
              </a>
            </p>
            {liveReceipt && <ReceiptTable receipt={liveReceipt} />}
            {liveReceipt && liveReceipt.walrusBlobIdBytes.length > 0 && (
              <PacketViewer receipt={liveReceipt} />
            )}
          </section>
        </div>
      </details>
    </main>
  );
}

type ReceiptData = {
  status: number;
  mandateId: string;
  listingId: string;
  agent: string;
  provider: string;
  submittedAtMs: number;
  accessExpiresAtMs: number;
  walrusBlobIdBytes: number[];
};

const WALRUS_EPOCH_DURATION_MS = 86_400_000;
const WALRUS_CONFIGURED_EPOCHS = Number(
  process.env["NEXT_PUBLIC_WALRUS_EPOCHS"] ?? 5,
);

function ReceiptTable({ receipt }: { receipt: ReceiptData }) {
  const blobIdStr =
    receipt.walrusBlobIdBytes.length > 0
      ? new TextDecoder().decode(new Uint8Array(receipt.walrusBlobIdBytes))
      : "";
  const isMock = blobIdStr.startsWith("mock:");
  const storageLabel = blobIdStr.length === 0
    ? "Unknown"
    : isMock
      ? "Mock (labeled)"
      : "Live Walrus";

  // Estimate blob expiry from configured epoch count
  const blobExpiryEstimate = isMock
    ? null
    : new Date(Date.now() + WALRUS_CONFIGURED_EPOCHS * WALRUS_EPOCH_DURATION_MS);

  const accessExpiry = new Date(receipt.accessExpiresAtMs);
  const mismatch =
    !isMock &&
    blobExpiryEstimate !== null &&
    blobExpiryEstimate < accessExpiry;

  return (
    <div className="table-shell">
    <table style={{ fontSize: "0.9rem" }}>
      <tbody>
        <Row
          label="Status"
          value={
            <span className={receipt.status === 1 ? "badge success" : "badge neutral"} data-testid="receipt-status" data-status={receipt.status === 1 ? "submitted" : receipt.status === 2 ? "withdrawn" : String(receipt.status)}>
              {receipt.status === 1 ? "Submitted" : receipt.status === 2 ? "Withdrawn" : String(receipt.status)}
            </span>
          }
        />
        <Row
          label="Mandate"
          value={
            <a href={EXPLORER_OBJECT(receipt.mandateId)} target="_blank" rel="noreferrer">
              <code>{receipt.mandateId.slice(0, 16)}…</code>
            </a>
          }
        />
        <Row
          label="Listing"
          value={
            <a href={EXPLORER_OBJECT(receipt.listingId)} target="_blank" rel="noreferrer">
              <code>{receipt.listingId.slice(0, 16)}…</code>
            </a>
          }
        />
        <Row label="Agent" value={<code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{receipt.agent}</code>} />
        <Row
          label="Provider"
          value={<code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{receipt.provider}</code>}
        />
        <Row label="Submitted" value={new Date(receipt.submittedAtMs).toISOString()} />
        <Row label="Access expires" value={accessExpiry.toISOString()} />
        <Row label="Storage mode" value={<span data-testid="blob-mode-badge" data-mode={isMock ? "mock" : "live"}>{storageLabel}</span>} />
        {blobExpiryEstimate && (
          <Row
            label="Blob expiry (est.)"
            value={
              <span style={{ color: mismatch ? "#dc2626" : undefined }}>
                {blobExpiryEstimate.toISOString()}
                {` (~${WALRUS_CONFIGURED_EPOCHS} epochs)`}
                {mismatch && " ⚠ Blob expires before access window"}
              </span>
            }
          />
        )}
      </tbody>
    </table>
    </div>
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
