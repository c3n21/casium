/**
 * The double constraint, enforced against live chain state.
 *
 * "World limits who the agent represents. Sui limits what the agent can do."
 * The provider is where the two meet: on every reservation it reads the mandate
 * object from testnet and compares its `agent_evm` against the AgentKit-verified
 * signer, and its `agent_sui` against the address in the request. Neither check
 * can be exercised by a stub — the mandate has to be real.
 *
 * `SMOKE.mandateId` is the fixture that makes this provable without writing
 * anything: it is a real, unrevoked testnet mandate whose `agent_evm` is
 * *not* this agent's address.
 */

import { PUBLISHER_ADDRESS, SMOKE } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { AGENT_EVM_ADDRESS } from "../../src/live/env.js";
import { errorCode, reserve, type ReserveBody } from "../../src/live/providerApi.js";
import { readMandate } from "../../src/live/chain.js";
import { LIVE_MANDATE_ID } from "../../src/live/session.js";

function reserveBody(listingObjectId: string, overrides: Partial<ReserveBody> = {}): ReserveBody {
  return {
    mandateId: LIVE_MANDATE_ID,
    listingObjectId,
    agentSuiAddress: PUBLISHER_ADDRESS,
    agentEvmAddress: AGENT_EVM_ADDRESS,
    walrusBlobId: `mock:${crypto.randomUUID()}`,
    packetHash: `0x${"b4c5d6e7".repeat(8)}`,
    accessExpiresAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}

test("the fixture mandates carry the on-chain identities this tier assumes", async () => {
  const [live, smoke] = await Promise.all([
    readMandate(LIVE_MANDATE_ID),
    readMandate(SMOKE.mandateId),
  ]);

  expect(live.revoked).toBe(false);
  expect(live.agentSui.toLowerCase()).toBe(PUBLISHER_ADDRESS.toLowerCase());
  expect(live.agentEvm?.toLowerCase()).toBe(AGENT_EVM_ADDRESS.toLowerCase());

  // The negative fixture. If this ever equals the agent's address, the two
  // rejection tests below would start passing for the wrong reason.
  expect(smoke.agentEvm?.toLowerCase()).not.toBe(AGENT_EVM_ADDRESS.toLowerCase());
});

test("a mandate bound to a different World agent is rejected", async ({
  request,
  listing,
  human,
}) => {
  const response = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId, { mandateId: SMOKE.mandateId }),
    human.headers,
  );

  expect(response.status()).toBe(403);
  expect(await errorCode(response)).toBe("MANDATE_EVM_MISMATCH");
});

test("a request naming a Sui agent the mandate did not authorize is rejected", async ({
  request,
  listing,
  human,
}) => {
  // A well-formed address that is not the mandate's `agent_sui`.
  const impostor = `0x${"9".repeat(64)}`;

  const response = await reserve(
    request,
    listing.id,
    reserveBody(listing.listingObjectId, { agentSuiAddress: impostor }),
    human.headers,
  );

  expect(response.status()).toBe(403);
  expect(await errorCode(response)).toBe("MANDATE_SUI_MISMATCH");
});

test("a reservation for a listing the provider does not know is rejected", async ({
  request,
  listing,
  human,
}) => {
  const response = await reserve(
    request,
    "listing_does_not_exist",
    reserveBody(listing.listingObjectId),
    human.headers,
  );

  expect(response.status()).toBe(404);
  expect(await errorCode(response)).toBe("LISTING_NOT_FOUND");
});

test("a body whose listing object contradicts the provider record is rejected", async ({
  request,
  listing,
  human,
}) => {
  const response = await reserve(
    request,
    listing.id,
    reserveBody(`0x${"7".repeat(64)}`),
    human.headers,
  );

  expect(response.status()).toBe(422);
  expect(await errorCode(response)).toBe("SUI_MANDATE_REJECTED");
});

test("the agent page refuses a mandate bound to a different agent, reading it from chain", async ({
  page,
}) => {
  // No NEXT_PUBLIC_E2E_STUB_SUI in this tier, so the preflight below is a real
  // gRPC read of SMOKE.mandateId from the browser. The URL parameter is the
  // page's highest-priority mandate source, so no session seeding is needed.
  await page.goto(`/agent?mandateId=${SMOKE.mandateId}`);

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^Run: / }),
  });
  await section.getByRole("button", { name: "Start run" }).click();

  await expect(section.getByRole("alert")).toContainText("Mandate EVM mismatch.");
});
