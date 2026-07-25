import type { ApplicationReceipt, RentalListing, RentalMandate } from "./types.js";

type JsonObject = Record<string, unknown>;

export function parseMandate(json: unknown): RentalMandate {
  const fields = fieldsOf(json);
  return {
    id: idOf(fields.id),
    owner: stringOf(fields.owner),
    agentSui: stringOf(fields.agent_sui),
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
    submittedAtMs: numberOf(fields.submitted_at_ms),
    accessExpiresAtMs: numberOf(fields.access_expires_at_ms),
    status: numberOf(fields.status),
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
