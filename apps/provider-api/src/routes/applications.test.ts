import { ERROR_CODES } from "@rentdelegate/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

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

describe("application reservation routes", () => {
  it("reserves an application and returns a Sui submit hint", async () => {
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
    });

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: ERROR_CODES.DUPLICATE_HUMAN_LISTING });
  });

  it("rejects EVM and Sui agent mismatches", async () => {
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
});

function reserve(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request("/listings/listing_lisbon_eligible/applications", {
    method: "POST",
    headers: mockHeaders,
    body: JSON.stringify(body),
  });
}
