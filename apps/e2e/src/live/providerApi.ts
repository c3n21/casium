/**
 * Thin HTTP client for the **real** provider API on :4021.
 *
 * The stubbed tier intercepts this API in the browser; the live tier drives it
 * over the wire. Setup calls (`createListing`, `registerPacket`) throw on a
 * non-2xx, because a failed fixture must not look like a failed assertion.
 * Flow calls (`reserve`, `verifyReceipt`) return the raw response — their
 * status code is usually the thing under test.
 */

import type { APIRequestContext, APIResponse } from "@playwright/test";
import { PUBLISHER_ADDRESS, SMOKE } from "@casium/contracts-config";
import { MUNICIPALITIES } from "@casium/shared";
import { PROVIDER_API_URL } from "./env.js";

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
  submitHint: {
    packageId: string | null;
    module: string;
    function: string;
    mandateId: string;
    listingObjectId: string;
    agentSuiAddress: string;
  };
  receipt?: {
    receiptId: string;
    txDigest: string;
    mandateId: string;
    listingObjectId: string;
    submittedAtMs: number;
    accessExpiresAtMs: number;
    blobVerification: "skipped-mock" | "verified";
  };
};

export type PacketRecord = {
  mandateId: string;
  providerListingId: string;
  walrusBlobId: string;
  packetHash: string;
  sizeBytes: number;
  encryptionMode: "aes-gcm" | "seal" | "mock";
  registeredAtMs: number;
};

/** A World identity as the mock AgentKit verifier reads it off the request. */
export type LiveHuman = {
  humanIdHash: string;
  agentEvmAddress: string;
  headers: Record<string, string>;
};

export function agentKitHeaders(human: LiveHuman, mandateAgentSuiAddress?: string) {
  return {
    ...human.headers,
    ...(mandateAgentSuiAddress
      ? { "x-demo-mandate-agent-sui-address": mandateAgentSuiAddress }
      : {}),
  };
}

async function expectCreated(response: APIResponse, what: string): Promise<void> {
  if (response.ok()) return;
  throw new Error(
    `Live provider API refused to ${what}: ${response.status()} ${await response.text()}`,
  );
}

/**
 * Create a provider-side listing row bound to a real on-chain listing object.
 *
 * Every test that reserves gets its own listing, because the duplicate-human
 * guard is global per (listing, human) for the lifetime of the provider process
 * — two parallel tests sharing a seeded listing would 409 each other.
 *
 * This writes no chain state. Creating the `RentalListing` object itself is a
 * wallet-signed transaction and belongs to the T3 tier; the on-chain listing
 * referenced here already exists on testnet.
 */
export async function createListing(
  request: APIRequestContext,
  overrides: Partial<ProviderListing> = {},
): Promise<ProviderListing> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const listing: ProviderListing = {
    id: `listing_e2e_${suffix}`,
    listingObjectId: SMOKE.listingObjectId,
    externalListingId: `e2e-${suffix}`,
    providerSuiAddress: PUBLISHER_ADDRESS,
    landlordSuiAddress: PUBLISHER_ADDRESS,
    municipalityCode: MUNICIPALITIES.LISBON,
    monthlyRentEur: 1700,
    bedrooms: 2,
    active: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };

  const response = await request.post(`${PROVIDER_API_URL}/listings`, { data: listing });
  await expectCreated(response, `create listing ${listing.id}`);
  return (await response.json()) as ProviderListing;
}

export async function listListings(request: APIRequestContext): Promise<ProviderListing[]> {
  const response = await request.get(`${PROVIDER_API_URL}/listings`);
  const { listings } = (await response.json()) as { listings: ProviderListing[] };
  return listings;
}

export async function registerPacket(
  request: APIRequestContext,
  packet: Omit<PacketRecord, "registeredAtMs">,
): Promise<PacketRecord> {
  const response = await request.post(`${PROVIDER_API_URL}/packets`, { data: packet });
  await expectCreated(response, `register packet for ${packet.providerListingId}`);
  return (await response.json()) as PacketRecord;
}

export async function packetsForMandate(
  request: APIRequestContext,
  mandateId: string,
): Promise<PacketRecord[]> {
  const response = await request.get(
    `${PROVIDER_API_URL}/packets/by-mandate/${encodeURIComponent(mandateId)}`,
  );
  const { packets } = (await response.json()) as { packets: PacketRecord[] };
  return packets;
}

export type ReserveBody = {
  mandateId: string;
  listingObjectId: string;
  agentSuiAddress: string;
  agentEvmAddress: string;
  walrusBlobId: string;
  packetHash: string;
  accessExpiresAtMs: number;
  idempotencyKey: string;
};

export async function reserve(
  request: APIRequestContext,
  providerListingId: string,
  body: ReserveBody,
  headers: Record<string, string>,
): Promise<APIResponse> {
  return request.post(
    `${PROVIDER_API_URL}/listings/${encodeURIComponent(providerListingId)}/applications`,
    { data: body, headers },
  );
}

export async function verifyReceipt(
  request: APIRequestContext,
  applicationId: string,
  input: { txDigest: string; receiptId: string },
): Promise<APIResponse> {
  return request.post(
    `${PROVIDER_API_URL}/applications/${encodeURIComponent(applicationId)}/verify`,
    { data: { applicationId, ...input } },
  );
}

export async function getApplication(
  request: APIRequestContext,
  applicationId: string,
): Promise<ReservedApplication> {
  const response = await request.get(
    `${PROVIDER_API_URL}/applications/${encodeURIComponent(applicationId)}`,
  );
  await expectCreated(response, `read application ${applicationId}`);
  return (await response.json()) as ReservedApplication;
}

export async function listApplications(
  request: APIRequestContext,
  filters: { listingId?: string; mandateId?: string; status?: string } = {},
): Promise<ReservedApplication[]> {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined) as [string, string][],
  );
  const response = await request.get(`${PROVIDER_API_URL}/applications?${query.toString()}`);
  const { applications } = (await response.json()) as { applications: ReservedApplication[] };
  return applications;
}

/** Error code carried by a provider rejection, e.g. `DUPLICATE_HUMAN_LISTING`. */
export async function errorCode(response: APIResponse): Promise<string> {
  const body = (await response.json()) as { error?: string };
  return body.error ?? "";
}
