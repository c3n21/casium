import type { ApplicationReceipt, RentalListing, RentalMandate } from "./types.js";

type JsonObject = Record<string, unknown>;

export function parseMandate(json: unknown): RentalMandate {
  const fields = fieldsOf(json);
  return {
    id: idOf(fields.id),
    owner: stringOf(fields.owner),
    agentSui: stringOf(fields.agent_sui),
    // agent_evm arrives as a number array (vector<u8>). An empty array means the
    // field was never set — return null so callers can distinguish "not set" from
    // a real address. A non-empty array is normalised to lowercase 0x-prefixed hex
    // regardless of byte length; wrong-length values are kept unpadded/untruncated
    // so downstream code (e.g. the provider's mismatch check) can detect them.
    agentEvm: evmHexOf(fields.agent_evm),
    maxMonthlyRentEur: numberOf(fields.max_monthly_rent_eur),
    allowedMunicipalities: numberArrayOf(fields.allowed_municipalities),
    minBedrooms: numberOf(fields.min_bedrooms),
    expiresAtMs: numberOf(fields.expires_at_ms),
    remainingApplications: numberOf(fields.remaining_applications),
    revoked: booleanOf(fields.revoked),
    permittedActions: numberOf(fields.permitted_actions),
  };
}

export function parseListing(json: unknown): RentalListing {
  const fields = fieldsOf(json);
  return {
    id: idOf(fields.id),
    provider: stringOf(fields.provider),
    landlord: stringOf(fields.landlord),
    municipality: numberOf(fields.municipality),
    monthlyRentEur: numberOf(fields.monthly_rent_eur),
    bedrooms: numberOf(fields.bedrooms),
    active: booleanOf(fields.active),
    expiresAtMs: numberOf(fields.expires_at_ms),
  };
}

export function parseReceipt(json: unknown): ApplicationReceipt {
  const fields = fieldsOf(json);
  return {
    id: idOf(fields.id),
    mandateId: stringOf(fields.mandate_id),
    listingId: stringOf(fields.listing_id),
    agent: stringOf(fields.agent),
    provider: stringOf(fields.provider),
    landlord: stringOf(fields.landlord),
    walrusBlobIdBytes: byteArrayOf(fields.walrus_blob_id),
    packetHashBytes: byteArrayOf(fields.packet_hash),
    submittedAtMs: numberOf(fields.submitted_at_ms),
    accessExpiresAtMs: numberOf(fields.access_expires_at_ms),
    status: numberOf(fields.status),
    worldRefHashBytes: byteArrayOf(fields.world_ref_hash),
  };
}

function fieldsOf(json: unknown): JsonObject {
  if (!json || typeof json !== "object") {
    throw new Error("Expected Sui object JSON content");
  }
  return json as JsonObject;
}

function idOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const nested = value as JsonObject;
    if (typeof nested.id === "string") return nested.id;
    if (nested.id && typeof nested.id === "object" && typeof (nested.id as JsonObject).id === "string") {
      return (nested.id as JsonObject).id as string;
    }
  }
  throw new Error("Expected object ID field");
}

function stringOf(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected string field");
  return value;
}

function numberOf(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) throw new Error("Expected number field");
  return parsed;
}

function booleanOf(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected boolean field");
  return value;
}

function numberArrayOf(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("Expected number array field");
  return value.map(numberOf);
}

function byteArrayOf(value: unknown): number[] {
  if (typeof value === "string") {
    return [...Uint8Array.from(atob(value), (char) => char.charCodeAt(0))];
  }
  return numberArrayOf(value);
}

/**
 * Normalise an on-chain `vector<u8>` EVM address field to a lowercase 0x-prefixed
 * hex string, or null when the vector is empty (field never set).
 *
 * Design choices (see RD-162):
 * - Empty vector → null:  test mandates use `vector[]`; callers must handle null.
 * - 20-byte vector → canonical 40-hex-char address.
 * - Wrong-length vector → hex of whatever bytes are present, unpadded/untruncated.
 *   The provider's mismatch check will then reject it as malformed rather than
 *   silently comparing a truncated value.
 */
function evmHexOf(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const bytes = byteArrayOf(value);
  if (bytes.length === 0) return null;
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
