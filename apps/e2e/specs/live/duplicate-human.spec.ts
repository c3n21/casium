/**
 * The World guarantee, against the real provider: one verified human may hold
 * one application per listing, no matter how many mandates or agents they own.
 *
 * This is `scripts/demo-agentkit-duplicate.mjs` as an assertion. AgentKit runs
 * in mock mode — the provider trusts the `x-demo-*` headers — so what is proven
 * here is the *guard*, keyed on the human hash the verifier produces. That the
 * hash comes from a real World identity is the live-header path, which needs a
 * signature no test can mint.
 */

import { PUBLISHER_ADDRESS } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { AGENT_EVM_ADDRESS } from "../../src/live/env.js";
import {
  createListing,
  errorCode,
  reserve,
  type ReserveBody,
} from "../../src/live/providerApi.js";
import { LIVE_MANDATE_ID } from "../../src/live/session.js";

function reserveBody(listingObjectId: string, overrides: Partial<ReserveBody> = {}): ReserveBody {
  return {
    mandateId: LIVE_MANDATE_ID,
    listingObjectId,
    agentSuiAddress: PUBLISHER_ADDRESS,
    agentEvmAddress: AGENT_EVM_ADDRESS,
    walrusBlobId: `mock:${crypto.randomUUID()}`,
    packetHash: `0x${"a1b2c3d4".repeat(8)}`,
    accessExpiresAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}

test("a verified human reserves one application per listing", async ({
  request,
  listing,
  human,
}) => {
  const response = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId),
    human.headers,
  );

  expect(response.status()).toBe(202);
  const application = await response.json();
  expect(application).toMatchObject({
    listingId: listing.id,
    mandateId: LIVE_MANDATE_ID,
    humanIdHash: human.humanIdHash,
    status: "reserved",
  });
  // The provider tells the agent exactly which Move call to make next.
  expect(application.submitHint).toMatchObject({
    module: "rental",
    function: "submit_application",
    listingObjectId: listing.listingObjectId,
  });
});

test("the same human is refused a second application on the same listing", async ({
  request,
  listing,
  human,
}) => {
  const first = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId),
    human.headers,
  );
  expect(first.status()).toBe(202);

  // A different packet and a fresh idempotency key, so nothing short-circuits
  // as a replay — only the human is the same, and that is enough.
  const second = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId),
    human.headers,
  );

  expect(second.status()).toBe(409);
  expect(await errorCode(second)).toBe("DUPLICATE_HUMAN_LISTING");
});

test("a different human may still apply to the same listing", async ({
  request,
  listing,
  human,
}) => {
  const first = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId),
    human.headers,
  );
  expect(first.status()).toBe(202);

  const otherHuman = {
    ...human.headers,
    "x-demo-human-id-hash": `sha256:e2e-${crypto.randomUUID()}`,
  };
  const second = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId),
    otherHuman,
  );

  expect(second.status()).toBe(202);
});

test("replaying an identical request returns the same application, not a duplicate", async ({
  request,
  listing,
  human,
}) => {
  const body = reserveBody(listing.listingObjectId);

  const first = await reserve(request, listing.id, body, human.headers);
  const replay = await reserve(request, listing.id, body, human.headers);

  expect(first.status()).toBe(202);
  // 200, not 202: the provider is reporting a replay, not a new reservation.
  expect(replay.status()).toBe(200);
  expect((await replay.json()).id).toBe((await first.json()).id);
});

test("reusing an idempotency key with different data is rejected", async ({
  request,
  listing,
  human,
}) => {
  const body = reserveBody(listing.listingObjectId);
  const first = await reserve(request, listing.id, body, human.headers);
  expect(first.status()).toBe(202);

  const tampered = await reserve(
    request,
    listing.id,
    { ...body, walrusBlobId: `mock:${crypto.randomUUID()}` },
    human.headers,
  );

  expect(tampered.status()).toBe(409);
  expect(await errorCode(tampered)).toBe("IDEMPOTENCY_CONFLICT");
});

test("an unverified request never reaches the reservation logic", async ({ request, listing }) => {
  const response = await reserve(request, listing.id, reserveBody(listing.listingObjectId), {});

  expect(response.status()).toBe(401);
  expect(await errorCode(response)).toBe("AGENTKIT_UNVERIFIED");
});
