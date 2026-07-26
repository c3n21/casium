import { describe, expect, it } from "vitest";
import { ListingSchema, ReserveApplicationSchema, normalizeSuiAddress } from "./schemas.js";

const BASE_LISTING = {
  id: "listing_test",
  listingObjectId: "0x4000000000000000000000000000000000000000000000000000000000000004",
  externalListingId: "test-1",
  providerSuiAddress: "0x2000000000000000000000000000000000000000000000000000000000000002",
  landlordSuiAddress: "0x3000000000000000000000000000000000000000000000000000000000000003",
  municipalityCode: 1,
  monthlyRentEur: 1700,
  bedrooms: 2,
  active: true,
  createdAt: "2026-07-25T00:00:00.000Z",
};

const validReserveRequest = {
  mandateId: "0xabc123",
  listingObjectId: "0xdef456",
  agentSuiAddress: "0x0000000000000000000000000000000000000000000000000000000000aaa111",
  agentEvmAddress: "0x1111111111111111111111111111111111111111",
  walrusBlobId: "blob_123",
  packetHash: "0xbeef",
  accessExpiresAtMs: 1_790_000_000_000,
  idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
};

describe("ReserveApplicationSchema", () => {
  it("parses a valid reserve request", () => {
    expect(ReserveApplicationSchema.parse(validReserveRequest)).toEqual(validReserveRequest);
  });

  it("rejects invalid reserve requests", () => {
    expect(() =>
      ReserveApplicationSchema.parse({
        ...validReserveRequest,
        agentEvmAddress: "not-an-evm-address",
        idempotencyKey: "not-a-uuid",
      }),
    ).toThrow();
  });
});

describe("Sui address schema", () => {
  it("accepts full-length Sui addresses", () => {
    const result = ListingSchema.parse(BASE_LISTING);

    expect(result.providerSuiAddress).toBe(BASE_LISTING.providerSuiAddress);
  });

  it("normalizes abbreviated Sui addresses", () => {
    const result = ListingSchema.parse({
      ...BASE_LISTING,
      providerSuiAddress: "0x2",
      landlordSuiAddress: "0xC",
    });

    expect(result.providerSuiAddress).toBe(normalizeSuiAddress("0x2"));
    expect(result.landlordSuiAddress).toBe(normalizeSuiAddress("0xC"));
  });

  it("rejects EVM-shaped addresses in Sui address fields", () => {
    const result = ListingSchema.safeParse({
      ...BASE_LISTING,
      landlordSuiAddress: "0x1234567890123456789012345678901234567890",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("40-hex EVM address");
    }
  });

  it("rejects non-hex and overlong addresses", () => {
    expect(ListingSchema.safeParse({ ...BASE_LISTING, landlordSuiAddress: "0xzz" }).success).toBe(false);
    expect(
      ListingSchema.safeParse({ ...BASE_LISTING, landlordSuiAddress: `0x${"1".repeat(65)}` }).success,
    ).toBe(false);
  });
});
