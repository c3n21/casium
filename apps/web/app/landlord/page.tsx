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
  LANDLORD_ADDRESS,
} from "@casium/contracts-config";
import { ApplicationInbox, type ReservedApplication } from "@/components/ApplicationInbox";
import { ApplicationPacketAccess } from "@/components/ApplicationPacketAccess";
import { PacketViewer } from "@/components/PacketViewer";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";
const SMOKE_RECEIPT_ID = SMOKE.receiptId;
const LIVE_RECEIPT_ID = LIVE_AGENT_RUN.receiptId;
const E2E_STUB_SUI = process.env.NEXT_PUBLIC_E2E_STUB_SUI === "1";

export default function LandlordPage() {
  const suiClient = useCurrentClient();
  const account = useCurrentAccount();
  // The stubbed tier has no wallet, so it stands in a known address. It must be
  // the LANDLORD's: this page filters applications by landlordSuiAddress, and
  // standing in the publisher (the provider) matched nothing, so the inbox
  // rendered empty and the role-scoping spec could never see a card.
  const connectedAddress = account?.address ?? (E2E_STUB_SUI ? LANDLORD_ADDRESS : null);

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
      <section className="card mb-8">
        <h2>Your Applications</h2>
        {!connectedAddress ? (
          <p className="text-muted-ink">Connect your wallet to see applications for your listings.</p>
        ) : (
          <>
            <p className="text-muted-ink text-[0.85rem] mt-0">
              Showing applications where landlord address is{" "}
              <code className="text-[0.8rem]">{connectedAddress.slice(0, 20)}…</code>
            </p>
            {appsLoading && <p className="text-muted-ink">Loading applications…</p>}
            {appsError && (
              <p className="text-red">
                Error: {appsError instanceof Error ? appsError.message : "unknown"}
              </p>
            )}
            {!appsLoading && !appsError && (
              <ApplicationInbox
                role="landlord"
                applications={landlordApplications}
                onRefetch={() => void refetch()}
                renderPacketAccess={(application) => (
                  <ApplicationPacketAccess key={application.id} application={application} />
                )}
              />
            )}
          </>
        )}
      </section>

      {/* Demo evidence panel — explicitly labeled known testnet objects */}
      <details className="evidence-panel mt-4" data-testid="developer-evidence">
        <summary data-testid="demo-evidence-summary" className="text-[0.9rem]">
          Demo evidence (known testnet receipts)
        </summary>

        {/*
          These two receipts were submitted on 2026-07-25, before the browser
          uploaded through the live Walrus HTTP adapter, so their blob IDs are
          `mock:` and say so below. A receipt's walrusBlobId is written on chain
          at submit time and cannot be changed — this is history, not the
          current storage mode. Every application in "Your Applications" above
          carries a real testnet blob.
        */}
        <p
          data-testid="demo-evidence-storage-note"
          className="text-[0.8rem] text-muted-ink mt-3 mb-0"
        >
          Archived receipts from 2026-07-25, kept as fixed evidence. They predate live Walrus
          storage, so their blob IDs are <code>mock:</code> and cannot be decrypted — the blob ID is
          written on chain at submit time and is immutable. Applications above use real testnet
          blobs.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {/* Smoke receipt */}
          <section className="card" data-testid="receipt-panel-smoke">
            <h3 className="mt-0 text-base">Smoke receipt (testnet)</h3>
            <p className="text-[0.85rem] text-muted-ink mx-0 mt-0 mb-2">
              Object:{" "}
              <a href={EXPLORER_OBJECT(SMOKE_RECEIPT_ID)} target="_blank" rel="noreferrer">
                <code>{SMOKE_RECEIPT_ID.slice(0, 20)}…</code>
              </a>
            </p>

            {smokeLoading && <p className="text-muted-ink text-[0.85rem]">Loading from testnet…</p>}
            {smokeError && (
              <p className="text-red text-[0.85rem]">
                Error: {smokeError instanceof Error ? smokeError.message : "unknown"}
              </p>
            )}
            {smokeReceipt && <ReceiptTable receipt={smokeReceipt} />}
            {smokeReceipt && smokeReceipt.walrusBlobIdBytes.length > 0 && (
              <PacketViewer receipt={smokeReceipt} />
            )}
          </section>

          {/* Live agent receipt */}
          <section className="card" data-testid="receipt-panel-live">
            <h3 className="mt-0 text-base">Live agent receipt (RD-108, testnet)</h3>
            <p className="text-[0.85rem] text-muted-ink mx-0 mt-0 mb-2">
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
    <table className="text-sm">
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
        <Row label="Agent" value={<code className="break-all text-[0.8rem]">{receipt.agent}</code>} />
        <Row
          label="Provider"
          value={<code className="break-all text-[0.8rem]">{receipt.provider}</code>}
        />
        <Row label="Submitted" value={new Date(receipt.submittedAtMs).toISOString()} />
        <Row label="Access expires" value={accessExpiry.toISOString()} />
        <Row label="Storage mode" value={<span data-testid="blob-mode-badge" data-mode={isMock ? "mock" : "live"}>{storageLabel}</span>} />
        {blobExpiryEstimate && (
          <Row
            label="Blob expiry (est.)"
            value={
              <span className={mismatch ? "text-red" : undefined}>
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
      <td className="font-semibold pb-2 pr-4 whitespace-nowrap">{label}</td>
      <td className="pb-2">{value}</td>
    </tr>
  );
}
