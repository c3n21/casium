#!/usr/bin/env node

/*
 * RD-014 duplicate-human proof (controlled fixture).
 *
 * Two agents backed by the SAME World human apply to the same listing. The
 * first reserves; the second is rejected with 409 DUPLICATE_HUMAN_LISTING. A
 * third request carrying no AgentKit context is rejected with 401.
 *
 * This is a fixture, not live World verification: the AgentKit mock verifier
 * accepts the x-demo-* headers below, so the human hash is asserted rather
 * than proven. It exercises the real reserve path — including the RD-164
 * on-chain identity cross-check, which runs here against a stub mandate
 * reader instead of testnet. Never cite it as evidence of World verification;
 * that evidence lives in docs/world-agentkit.md.
 */

const { createApp } = await import("../apps/provider-api/dist/app.js").catch((error) => {
  console.error("Build provider API first: pnpm --filter @casium/provider-api build");
  throw error;
});

// Canonical demo listing object — imported, never hardcoded (RD-115). The
// seeded `listing_lisbon_eligible` points at this object, and reserve() rejects
// any request whose listingObjectId disagrees with the seed.
const { DEMO_LISTING_OBJECT_ID } = await import("../packages/contracts-config/dist/index.js");

const listingId = "listing_lisbon_eligible";
const listingObjectId = DEMO_LISTING_OBJECT_ID;
const humanIdHash = "sha256:demo-human-same-world-user";

// One World human, two agents — each with its own mandate, which is how a
// second agent for the same human would actually be authorized on chain.
const agentOne = {
  evm: "0x1111111111111111111111111111111111111111",
  sui: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  mandateId: "0x1111111111111111111111111111111111111111111111111111111111111111",
};
const agentTwo = {
  evm: "0x2222222222222222222222222222222222222222",
  sui: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  mandateId: "0x2222222222222222222222222222222222222222222222222222222222222222",
};

/**
 * Stub for the on-chain mandate read (RD-164). Without it `createApp()` leaves
 * the identity cross-check unenforced and this script would prove less than the
 * real path does. Each fixture mandate authorizes exactly its own agent pair,
 * so both requests clear the identity gate and the duplicate-human rule is the
 * only thing that separates them.
 */
const mandatesByAgent = new Map([agentOne, agentTwo].map((a) => [a.mandateId, a]));
const mandateReader = {
  async getMandate(id) {
    const agent = mandatesByAgent.get(id);
    if (!agent) return null;
    return {
      id,
      owner: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      agentSui: agent.sui,
      agentEvm: agent.evm,
      maxMonthlyRentEur: 2000,
      allowedMunicipalities: [1],
      minBedrooms: 1,
      expiresAtMs: 1_790_000_000_000,
      remainingApplications: 3,
      revoked: false,
      permittedActions: 1,
    };
  },
};

const app = createApp(undefined, mandateReader);

const first = await reserve(agentOne, "123e4567-e89b-12d3-a456-426614174201");
const duplicate = await reserve(agentTwo, "123e4567-e89b-12d3-a456-426614174202");
const unverified = await app.request(`/listings/${listingId}/applications`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(reserveBody(agentOne, "123e4567-e89b-12d3-a456-426614174203")),
});

const result = {
  mode: "mock-agentkit-controlled-fixture",
  sameHumanHash: humanIdHash,
  listingObjectId,
  first: await summarize(first),
  duplicateSameHumanDifferentAgent: await summarize(duplicate),
  unverified: await summarize(unverified),
};

console.log(JSON.stringify(result, null, 2));

if (result.first.status !== 202) process.exitCode = 1;
if (result.duplicateSameHumanDifferentAgent.status !== 409) process.exitCode = 1;
if (result.unverified.status !== 401) process.exitCode = 1;

function reserve(agent, idempotencyKey) {
  return app.request(`/listings/${listingId}/applications`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-human-id-hash": humanIdHash,
      "x-demo-agent-evm-address": agent.evm,
      "x-demo-mandate-agent-sui-address": agent.sui,
    },
    body: JSON.stringify(reserveBody(agent, idempotencyKey)),
  });
}

function reserveBody(agent, idempotencyKey) {
  return {
    mandateId: agent.mandateId,
    listingObjectId,
    agentSuiAddress: agent.sui,
    agentEvmAddress: agent.evm,
    walrusBlobId: "mock:blob",
    packetHash: "0xbeef",
    accessExpiresAtMs: 1_790_000_000_000,
    idempotencyKey,
  };
}

async function summarize(response) {
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}
