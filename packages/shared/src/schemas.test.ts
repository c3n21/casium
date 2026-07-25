import { describe, expect, it } from "vitest";
import { ReserveApplicationSchema } from "./schemas.js";

const validReserveRequest = {
  mandateId: "0xabc123",
  listingObjectId: "0xdef456",
  agentSuiAddress: "0xaaa111",
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
