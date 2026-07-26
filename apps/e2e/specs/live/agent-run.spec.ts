/**
 * Flow 4 — the agent pipeline, driven end to end against the real services.
 *
 * Every stage before signing is exercised for real: AgentCap discovery and
 * mandate load over testnet gRPC, deterministic eligibility against the real
 * listing object, packet lookup from the real provider, and a real reservation
 * that passes the provider's on-chain identity cross-check.
 *
 * ## Where this tier stops, and why that is not a gap in disguise
 *
 * The agent service runs with a throwaway Sui key (see playwright.config.ts).
 * `executeSubmitApplication` compares the key's address against
 * AGENT_SUI_ADDRESS and throws *before* it builds a transaction or selects a
 * gas coin, so a run that reaches the signing boundary fails there,
 * deterministically, having spent nothing. Signing `submit_application` for
 * real is the wallet tier (RD-150), under the repo's live-spend gate.
 *
 * That boundary shapes the specs below: a run that reaches an eligible target
 * throws out of the target loop, so its per-target results are lost. Outcomes
 * that complete the loop (ineligible, missing packet) are asserted from the run
 * result; the eligible path is asserted from what the provider recorded.
 */

import { INELIGIBLE_LISTING_OBJECT_ID, PUBLISHER_ADDRESS, SMOKE } from "@casium/contracts-config";
import { MUNICIPALITIES } from "@casium/shared";
import { expect, test } from "../../src/live/test.js";
import { AGENT_HUMAN_ID_HASH } from "../../src/live/env.js";
import { runToCompletion } from "../../src/live/agentApi.js";
import {
  createListing,
  listApplications,
  registerPacket,
} from "../../src/live/providerApi.js";
import { LIVE_MANDATE_ID, seedMandate, seedTargets } from "../../src/live/session.js";

/** A registered packet is a precondition for every run; its bytes are mock. */
async function givenPacket(
  request: import("@playwright/test").APIRequestContext,
  providerListingId: string,
) {
  const blobId = `mock:${crypto.randomUUID()}`;
  const packetHash = `0x${"c3d4e5f6".repeat(8)}`;
  await registerPacket(request, {
    mandateId: LIVE_MANDATE_ID,
    providerListingId,
    walrusBlobId: blobId,
    packetHash,
    sizeBytes: 861,
    encryptionMode: "mock",
  });
  return { blobId, packetHash };
}

test("an ineligible listing is rejected by the rules engine, not by the chain", async ({
  request,
}) => {
  const porto = await createListing(request, {
    listingObjectId: INELIGIBLE_LISTING_OBJECT_ID,
    municipalityCode: MUNICIPALITIES.PORTO_INELIGIBLE_DEMO,
    monthlyRentEur: 1200,
  });
  await givenPacket(request, porto.id);

  const run = await runToCompletion(request, {
    mandateId: LIVE_MANDATE_ID,
    targets: [{ providerListingId: porto.id, listingObjectId: porto.listingObjectId }],
  });

  expect(run.status).toBe("done");
  if (run.status !== "done") return;
  expect(run.result.status).toBe("ineligible");
  // Both objects were read from testnet: municipality 6 against the mandate's
  // allowed list. No gas is spent proving a listing is out of scope.
  expect(run.result.targets?.[0]).toMatchObject({
    providerListingId: porto.id,
    status: "ineligible",
  });
  expect(run.result.targets?.[0]?.reason).toContain("municipality 6 is not in mandate");
});

test("a target with no registered packet fails before any reservation", async ({ request }) => {
  const listing = await createListing(request);

  const run = await runToCompletion(request, {
    mandateId: LIVE_MANDATE_ID,
    targets: [{ providerListingId: listing.id, listingObjectId: listing.listingObjectId }],
  });

  expect(run.status).toBe("done");
  if (run.status !== "done") return;
  expect(run.result.targets?.[0]).toMatchObject({
    providerListingId: listing.id,
    status: "failed",
    reason: "No packet registered for this listing.",
  });

  expect(await listApplications(request, { listingId: listing.id })).toHaveLength(0);
});

test("an eligible target is reserved with the real provider, then stops at the signing boundary", async ({
  request,
}) => {
  const listing = await createListing(request);
  const { blobId, packetHash } = await givenPacket(request, listing.id);

  const run = await runToCompletion(request, {
    mandateId: LIVE_MANDATE_ID,
    targets: [{ providerListingId: listing.id, listingObjectId: listing.listingObjectId }],
  });

  // The gas gate, asserted rather than assumed: the agent refused to sign with
  // a key that is not the mandate's authorized agent.
  expect(run.status).toBe("failed");
  if (run.status !== "failed") return;
  expect(run.error).toContain("Agent Sui key address mismatch");

  // Everything before that boundary really happened. This record is the
  // provider's, written by the agent's own reservation call.
  const [application, ...rest] = await listApplications(request, { listingId: listing.id });
  expect(rest).toHaveLength(0);
  expect(application).toMatchObject({
    listingId: listing.id,
    listingObjectId: SMOKE.listingObjectId,
    mandateId: LIVE_MANDATE_ID,
    agentSuiAddress: PUBLISHER_ADDRESS,
    humanIdHash: AGENT_HUMAN_ID_HASH,
    walrusBlobId: blobId,
    packetHash,
    status: "reserved",
  });
});

test("the operator page runs the agent and renders the per-listing outcome", async ({
  page,
  request,
}) => {
  // Porto: the one eligible-loop outcome that survives to a rendered result in
  // a tier that cannot sign.
  const porto = await createListing(request, {
    listingObjectId: INELIGIBLE_LISTING_OBJECT_ID,
    municipalityCode: MUNICIPALITIES.PORTO_INELIGIBLE_DEMO,
    monthlyRentEur: 1200,
  });
  await givenPacket(request, porto.id);

  await seedMandate(page);
  await seedTargets(page, [
    {
      providerListingId: porto.id,
      listingObjectId: porto.listingObjectId,
      externalListingId: porto.externalListingId,
    },
  ]);
  await page.goto("/agent");

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^Run: / }),
  });
  await expect(section.getByRole("heading", { name: `Run: ${porto.externalListingId}` })).toBeVisible();
  await expect(section.getByRole("textbox")).toHaveValue(LIVE_MANDATE_ID);

  await section.getByRole("button", { name: "Start run" }).click();

  // `exact` is required: the section description also contains the word
  // "status", and default text matching is a case-insensitive substring.
  await expect(section.getByText("Status: ineligible", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(section.getByText("Per-listing results:")).toBeVisible();
  await expect(section.getByText(porto.externalListingId, { exact: true })).toBeVisible();
  await expect(section.getByText("Status: complete", { exact: true })).toHaveCount(0);
});

test("the page blocks a run whose target has no packet, before calling the agent", async ({
  page,
  request,
}) => {
  const listing = await createListing(request);

  await seedMandate(page);
  await seedTargets(page, [
    {
      providerListingId: listing.id,
      listingObjectId: listing.listingObjectId,
      externalListingId: listing.externalListingId,
    },
  ]);
  await page.goto("/agent");

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^Run: / }),
  });
  await section.getByRole("button", { name: "Start run" }).click();

  await expect(section.getByRole("alert")).toContainText(
    `No packet is registered for target ${listing.externalListingId}.`,
  );
  expect(await listApplications(request, { listingId: listing.id })).toHaveLength(0);
});
