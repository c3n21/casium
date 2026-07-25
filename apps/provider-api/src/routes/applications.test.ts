import { ERROR_CODES } from "@rentdelegate/shared";
import type { RentalMandate } from "@rentdelegate/sui-client";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { ReceiptVerificationService } from "../services/suiVerifier.js";

const reserveRequest = {
  mandateId: "0xabc123",
  listingObjectId: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
  agentSuiAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  agentEvmAddress: "0x1111111111111111111111111111111111111111",
  walrusBlobId: "mock:blob",
  packetHash: "0xbeef",
  accessExpiresAtMs: 1_790_000_000_000,
  idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
};

const mockHeaders = {
  "content-type": "application/json",
  "x-demo-human-id-hash": "sha256:human-1",
  "x-demo-agent-evm-address": reserveRequest.agentEvmAddress,
  "x-demo-mandate-agent-sui-address": reserveRequest.agentSuiAddress,
};

// A mandate reader stub whose getMandate matches the happy-path reserveRequest.
function matchingMandateReader(overrides?: Partial<RentalMandate>) {
  const mandate: RentalMandate = {
    id: reserveRequest.mandateId,
    owner: "0xowner",
    agentSui: reserveRequest.agentSuiAddress,
    agentEvm: reserveRequest.agentEvmAddress,
    maxMonthlyRentEur: 2000,
    allowedMunicipalities: [1],
    minBedrooms: 1,
    expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
    remainingApplications: 3,
    revoked: false,
    permittedActions: 1,
    ...overrides,
  };
  return { getMandate: async (_id: string) => mandate };
}

describe("application reservation routes", () => {
  it("reserves an application and returns a Sui submit hint", async () => {
    // No mandateReader → check skipped, warning logged — existing behaviour preserved.
    const app = createApp();
    const response = await reserve(app, reserveRequest);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      id: "app_1",
      status: "reserved",
      humanIdHash: "sha256:human-1",
      submitHint: {
        function: "submit_application",
        listingObjectId: reserveRequest.listingObjectId,
      },
    });
  });

  it("rejects duplicate human for the same listing", async () => {
    const app = createApp();
    expect((await reserve(app, reserveRequest)).status).toBe(202);

    const duplicate = await reserve(app, {
      ...reserveRequest,
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174001",
      walrusBlobId: "mock:different-packet",
    });

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: ERROR_CODES.DUPLICATE_HUMAN_LISTING });
  });

  it("replays an exact duplicate human/listing/mandate/packet reservation", async () => {
    const app = createApp();
    expect((await reserve(app, reserveRequest)).status).toBe(202);

    const replay = await reserve(app, {
      ...reserveRequest,
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174001",
    });

    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ id: "app_1", mandateId: reserveRequest.mandateId });
  });

  it("rejects EVM and Sui agent mismatches (header vs request body)", async () => {
    const evmMismatch = await reserve(createApp(), {
      ...reserveRequest,
      agentEvmAddress: "0x2222222222222222222222222222222222222222",
    });
    expect(evmMismatch.status).toBe(403);
    expect(await evmMismatch.json()).toEqual({ error: ERROR_CODES.MANDATE_EVM_MISMATCH });

    const suiMismatch = await reserve(createApp(), {
      ...reserveRequest,
      agentSuiAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(suiMismatch.status).toBe(403);
    expect(await suiMismatch.json()).toEqual({ error: ERROR_CODES.MANDATE_SUI_MISMATCH });
  });

  it("replays identical idempotency requests and rejects conflicting ones", async () => {
    const app = createApp();
    expect((await reserve(app, reserveRequest)).status).toBe(202);

    const replay = await reserve(app, reserveRequest);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ id: "app_1" });

    const conflict = await reserve(app, {
      ...reserveRequest,
      walrusBlobId: "mock:other",
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: ERROR_CODES.IDEMPOTENCY_CONFLICT });
  });

  it("requires explicit mock AgentKit headers", async () => {
    const response = await createApp().request("/listings/listing_lisbon_eligible/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reserveRequest),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: ERROR_CODES.AGENTKIT_UNVERIFIED });
  });

  it("verifies a matching Sui receipt and accepts the application", async () => {
    const app = createApp(mockReceiptVerifier());
    expect((await reserve(app, reserveRequest)).status).toBe(202);

    const response = await app.request("/applications/app_1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: "app_1", txDigest: "tx_1", receiptId: "0xcafe" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "app_1",
      status: "accepted",
      receipt: { receiptId: "0xcafe", txDigest: "tx_1" },
    });
  });

  it("rejects invalid receipts and duplicate tx digests", async () => {
    const app = createApp(mockReceiptVerifier());
    expect((await reserve(app, reserveRequest)).status).toBe(202);

    const mismatch = await app.request("/applications/app_1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: "app_2", txDigest: "tx_bad", receiptId: "0xcafe" }),
    });
    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toEqual({ error: ERROR_CODES.RECEIPT_INVALID });

    const first = await verify(app, "tx_1");
    expect(first.status).toBe(200);

    const duplicateTx = await verify(app, "tx_1");
    expect(duplicateTx.status).toBe(422);
    expect(await duplicateTx.json()).toEqual({ error: ERROR_CODES.RECEIPT_INVALID });
  });
});

// ── RD-164: on-chain mandate identity enforcement ─────────────────────────────
describe("on-chain mandate identity enforcement (RD-164)", () => {
  it("accepts a reserve whose on-chain mandate matches the AgentKit signer", async () => {
    const app = createApp(undefined, matchingMandateReader());
    const response = await reserve(app, reserveRequest);
    expect(response.status).toBe(202);
  });

  it("rejects when the on-chain agentEvm does not match the AgentKit signer", async () => {
    const reader = matchingMandateReader({ agentEvm: "0x9999999999999999999999999999999999999999" });
    const response = await reserve(createApp(undefined, reader), reserveRequest);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ERROR_CODES.MANDATE_EVM_MISMATCH });
  });

  it("rejects when the on-chain agentSui does not match the request body", async () => {
    const reader = matchingMandateReader({
      agentSui: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
    const response = await reserve(createApp(undefined, reader), reserveRequest);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ERROR_CODES.MANDATE_SUI_MISMATCH });
  });

  it("rejects when the mandate is not found on chain", async () => {
    const reader = {
      getMandate: async (_id: string): Promise<RentalMandate> => {
        throw new Error("object not found");
      },
    };
    const response = await reserve(createApp(undefined, reader), reserveRequest);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: ERROR_CODES.SUI_MANDATE_REJECTED });
  });

  it("rejects legacy mandates with empty agentEvm as MANDATE_EVM_MISMATCH", async () => {
    const reader = matchingMandateReader({ agentEvm: null });
    const response = await reserve(createApp(undefined, reader), reserveRequest);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ERROR_CODES.MANDATE_EVM_MISMATCH });
  });

  it("rejects revoked mandates before they reach submit_application", async () => {
    const reader = matchingMandateReader({ revoked: true });
    const response = await reserve(createApp(undefined, reader), reserveRequest);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: ERROR_CODES.SUI_MANDATE_REJECTED });
  });

  it("is case-insensitive when comparing EVM addresses", async () => {
    // on-chain stored in uppercase, header in lowercase (or vice versa)
    const reader = matchingMandateReader({ agentEvm: reserveRequest.agentEvmAddress.toUpperCase() });
    const response = await reserve(createApp(undefined, reader), reserveRequest);
    expect(response.status).toBe(202);
  });

  it("replayed idempotent requests are not re-fetched (no duplicate getMandate calls)", async () => {
    let getMandate_calls = 0;
    const reader = {
      getMandate: async (_id: string): Promise<RentalMandate> => {
        getMandate_calls++;
        return {
          id: reserveRequest.mandateId,
          owner: "0xowner",
          agentSui: reserveRequest.agentSuiAddress,
          agentEvm: reserveRequest.agentEvmAddress,
          maxMonthlyRentEur: 2000,
          allowedMunicipalities: [1],
          minBedrooms: 1,
          expiresAtMs: Date.now() + 86_400_000,
          remainingApplications: 3,
          revoked: false,
          permittedActions: 1,
        };
      },
    };

    const app = createApp(undefined, reader);
    expect((await reserve(app, reserveRequest)).status).toBe(202);
    expect(getMandate_calls).toBe(1);

    // Replay — idempotency shortcut runs before the mandate fetch.
    const replay = await reserve(app, reserveRequest);
    expect(replay.status).toBe(200);
    // Replayed requests return early from the idempotency map before reaching the
    // mandate fetch, so getMandate should still be 1.
    expect(getMandate_calls).toBe(1);
  });
});

describe.skipIf(process.env.RUN_SUI_TESTNET !== "1")("application receipt live smoke", () => {
  it("verifies the RD-007 testnet receipt through the provider route", async () => {
    const app = createApp();
    const liveReserveRequest = {
      ...reserveRequest,
      mandateId: "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee",
      agentSuiAddress: "0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e",
      packetHash: "0x68617368",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174099",
    };

    const reserveResponse = await reserve(app, liveReserveRequest, {
      ...mockHeaders,
      "x-demo-mandate-agent-sui-address": liveReserveRequest.agentSuiAddress,
    });
    expect(reserveResponse.status).toBe(202);

    const verifyResponse = await app.request("/applications/app_1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        applicationId: "app_1",
        txDigest: "6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh",
        receiptId: "0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20",
      }),
    });

    expect(verifyResponse.status).toBe(200);
    expect(await verifyResponse.json()).toMatchObject({ status: "accepted" });
  });
});

function reserve(app: ReturnType<typeof createApp>, body: unknown, headers = mockHeaders) {
  return app.request("/listings/listing_lisbon_eligible/applications", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function verify(app: ReturnType<typeof createApp>, txDigest: string) {
  return app.request("/applications/app_1/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: "app_1", txDigest, receiptId: "0xcafe" }),
  });
}

function mockReceiptVerifier(): ReceiptVerificationService {
  return {
    async verify(application, input) {
      if (input.receiptId !== "0xcafe") return { ok: false };

      return {
        ok: true,
        value: {
          receiptId: input.receiptId,
          txDigest: input.txDigest,
          mandateId: application.mandateId,
          listingObjectId: application.listingObjectId,
          submittedAtMs: 1_784_962_851_988,
          accessExpiresAtMs: 1_790_000_000_000,
          blobVerification: "skipped-mock",
          rawObject: {
            id: input.receiptId,
            mandateId: application.mandateId,
            listingId: application.listingObjectId,
            agent: application.agentSuiAddress,
            provider: application.providerSuiAddress,
            landlord: application.landlordSuiAddress,
            walrusBlobIdBytes: [...new TextEncoder().encode(application.walrusBlobId)],
            packetHashBytes: [190, 239],
            submittedAtMs: 1_784_962_851_988,
            accessExpiresAtMs: 1_790_000_000_000,
            status: 1,
            worldRefHashBytes: [],
          },
        },
      };
    },
  };
}
