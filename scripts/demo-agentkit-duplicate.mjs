#!/usr/bin/env node

const { createApp } = await import("../apps/provider-api/dist/app.js").catch((error) => {
  console.error("Build provider API first: pnpm --filter @rentdelegate/provider-api build");
  throw error;
});

const listingId = "listing_lisbon_eligible";
const listingObjectId = "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a";
const humanIdHash = "sha256:demo-human-same-world-user";
const agentOne = {
  evm: "0x1111111111111111111111111111111111111111",
  sui: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};
const agentTwo = {
  evm: "0x2222222222222222222222222222222222222222",
  sui: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

const app = createApp();

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
    mandateId: "0xabc123",
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
