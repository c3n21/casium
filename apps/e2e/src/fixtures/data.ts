/**
 * Fixture payloads for the stubbed tier (RD-144).
 *
 * Shapes mirror the real provider-api and agent responses:
 *   ProviderListing        apps/web/app/provider/page.tsx
 *   ReservedApplication    apps/web/src/components/ApplicationInbox.tsx
 *   RunResult              apps/web/app/agent/page.tsx
 *
 * Every Sui object ID comes from @casium/contracts-config — never a
 * literal, or `pnpm lint:object-ids` fails (it scans *.spec.ts and *.ts here).
 */

import {
  INELIGIBLE_LISTING_OBJECT_ID,
  LIVE_AGENT_RUN,
  PUBLISHER_ADDRESS,
  SMOKE,
} from "@casium/contracts-config";

export type ProviderListing = {
  id: string;
  listingObjectId: string;
  externalListingId: string;
  providerSuiAddress: string;
  landlordSuiAddress: string;
  municipalityCode: number;
  monthlyRentEur: number;
  bedrooms: number;
  active: boolean;
  createdAt: string;
};

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
  receipt?: {
    receiptId: string;
    txDigest: string;
    mandateId: string;
    listingObjectId: string;
    submittedAtMs: number;
    accessExpiresAtMs: number;
  };
};

export type RunResult = {
  runId: string;
  mandateId: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
  status: "complete" | "ineligible" | "failed";
  reason?: string;
  error?: string;
  targets?: TargetResult[];
};

export type TargetResult = {
  providerListingId: string;
  listingObjectId: string;
  status: "complete" | "ineligible" | "failed";
  reason?: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
};

const AGENT_EVM_ADDRESS = "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe";

// Built rather than written out: a 64-hex literal would trip
// scripts/check-object-ids.mjs, which cannot tell a packet hash from an
// object ID. Neither is a real Sui object.
const MOCK_PACKET_HASH = `0x${"feedface".repeat(8)}`;
const MOCK_BLOB_ID = `mock:${"0f1e2d3c".repeat(8)}`;

/** Matches the provider-api seed in apps/provider-api/src/services/listings.ts. */
export const LISBON_LISTING: ProviderListing = {
  id: "listing_lisbon_eligible",
  listingObjectId: SMOKE.listingObjectId,
  externalListingId: "lisbon-demo-1",
  providerSuiAddress: PUBLISHER_ADDRESS,
  landlordSuiAddress: PUBLISHER_ADDRESS,
  municipalityCode: 1,
  monthlyRentEur: 1700,
  bedrooms: 2,
  active: true,
  createdAt: "2026-07-25T00:00:00.000Z",
};

export const PORTO_LISTING: ProviderListing = {
  id: "listing_porto_ineligible",
  listingObjectId: INELIGIBLE_LISTING_OBJECT_ID,
  externalListingId: "porto-demo-1",
  providerSuiAddress: PUBLISHER_ADDRESS,
  landlordSuiAddress: PUBLISHER_ADDRESS,
  municipalityCode: 6,
  monthlyRentEur: 1200,
  bedrooms: 2,
  active: true,
  createdAt: "2026-07-25T00:00:00.000Z",
};

export const SEEDED_LISTINGS: ProviderListing[] = [LISBON_LISTING, PORTO_LISTING];

export const LISBON_SECOND_LISTING: ProviderListing = {
  ...LISBON_LISTING,
  id: "listing_lisbon_second",
  externalListingId: "lisbon-demo-2",
  monthlyRentEur: 1800,
};

export const RESERVED_APPLICATION: ReservedApplication = {
  id: "app_1",
  listingId: LISBON_LISTING.id,
  listingObjectId: SMOKE.listingObjectId,
  providerSuiAddress: PUBLISHER_ADDRESS,
  landlordSuiAddress: PUBLISHER_ADDRESS,
  mandateId: SMOKE.mandateId,
  agentSuiAddress: PUBLISHER_ADDRESS,
  agentEvmAddress: AGENT_EVM_ADDRESS,
  humanIdHash: "sha256:demo-human-same-world-user",
  walrusBlobId: MOCK_BLOB_ID,
  packetHash: MOCK_PACKET_HASH,
  status: "reserved",
  idempotencyKey: "idem-e2e-1",
};

/** The digest/receipt pair the demo script uses for manual verification. */
export const VERIFY_INPUT = {
  txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
  receiptId: SMOKE.receiptId,
  mandateId: SMOKE.mandateId,
  listingObjectId: SMOKE.listingObjectId,
  submittedAtMs: 1_784_962_851_988,
  accessExpiresAtMs: 1_790_000_000_000,
};

export const AGENT_HEALTH = {
  ok: true,
  service: "casium-agent",
  agentSuiAddress: PUBLISHER_ADDRESS,
  agentEvmAddress: AGENT_EVM_ADDRESS,
  agentkitMode: "mock",
};

export function completeRunResult(runId: string): RunResult {
  return {
    runId,
    mandateId: SMOKE.mandateId,
    applicationId: "app_1",
    txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
    receiptId: LIVE_AGENT_RUN.receiptId,
    blobId: RESERVED_APPLICATION.walrusBlobId,
    status: "complete",
  };
}

export function completeMultiTargetRunResult(runId: string): RunResult {
  const first: TargetResult = {
    providerListingId: LISBON_LISTING.id,
    listingObjectId: LISBON_LISTING.listingObjectId,
    status: "complete",
    applicationId: "app_1",
    txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
    receiptId: LIVE_AGENT_RUN.receiptId,
    blobId: RESERVED_APPLICATION.walrusBlobId,
  };
  const second: TargetResult = {
    providerListingId: LISBON_SECOND_LISTING.id,
    listingObjectId: LISBON_SECOND_LISTING.listingObjectId,
    status: "complete",
    applicationId: "app_2",
    txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
    receiptId: LIVE_AGENT_RUN.receiptId,
    blobId: `mock:${"1a2b3c4d".repeat(8)}`,
  };

  return {
    ...first,
    runId,
    mandateId: LIVE_AGENT_RUN.mandateId,
    targets: [first, second],
  };
}

export function ineligibleRunResult(runId: string): RunResult {
  return {
    runId,
    mandateId: SMOKE.mandateId,
    status: "ineligible",
    reason: "Listing municipality not allowed by mandate",
  };
}

export function failedRunResult(runId: string): RunResult {
  return {
    runId,
    mandateId: SMOKE.mandateId,
    status: "failed",
    error: "No packet registered for mandate",
  };
}
