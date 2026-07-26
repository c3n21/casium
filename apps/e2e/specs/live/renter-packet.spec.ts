/**
 * Flows 2 and 3 — the renter's mandate is read from chain, and the encrypted
 * packet is registered with the real provider API.
 *
 * Two things the stubbed tier structurally cannot show:
 *   - the mandate panel is filled by a real gRPC read of a real testnet object,
 *     not by a fixture;
 *   - the privacy assertion is made against what the provider actually stored,
 *     not against what a `page.route` handler happened to capture.
 *
 * Creating the mandate is a wallet-signed transaction (wallet tier, RD-150).
 * This spec drives the mandate that already exists on testnet.
 */

import { PUBLISHER_ADDRESS } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { createListing, packetsForMandate } from "../../src/live/providerApi.js";
import { LIVE_MANDATE_ID, seedMandate } from "../../src/live/session.js";

const RENTER_NAME = "Zzz Synthetic Marker Name";
const COVER_LETTER = "Distinctive marker sentence that must never leave the browser.";
const SALARY = "4242";

async function fillPacketForm(page: import("@playwright/test").Page) {
  await page.getByLabel("Renter name (synthetic)").fill(RENTER_NAME);
  await page.getByLabel("Monthly net salary (EUR)").fill(SALARY);
  await page.getByLabel("Cover letter").fill(COVER_LETTER);
}

test("the mandate panel is filled from the live testnet object", async ({ page }) => {
  await seedMandate(page);
  await page.goto("/renter");

  const mandatePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Mandate", exact: true }),
  });

  await expect(mandatePanel.getByTestId("mandate-status")).toContainText("Active");
  await expect(mandatePanel.getByText("Remaining applications")).toBeVisible();
  // Mandate scope as published on chain: max €2000/month, Lisbon-area only.
  await expect(mandatePanel.getByText("€2000 / month")).toBeVisible();
  await expect(mandatePanel.getByText(PUBLISHER_ADDRESS, { exact: true })).toBeVisible();
});

test("a packet uploaded in the browser is stored listing-scoped by the real provider", async ({
  page,
  request,
}) => {
  // Its own mandate ID: packets are keyed by (mandate, listing), so a shared
  // mandate would let a parallel test's upload satisfy this one's assertion.
  const mandateId = `0x${crypto.randomUUID().replace(/-/g, "").repeat(2)}`;
  const listing = await createListing(request);

  await seedMandate(page, mandateId);
  await page.goto("/renter");
  await page.getByRole("checkbox", { name: new RegExp(listing.externalListingId) }).check();

  await expect(page.getByTestId("synthetic-data-badge")).toBeVisible();
  await expect(page.getByText("[MOCK encryption — AES-GCM, key in browser only]")).toBeVisible();

  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();

  await expect(page.getByTestId(`packet-uploaded-${listing.id}`)).toBeVisible();
  await expect(page.getByTestId(`packet-upload-status-${listing.id}`)).toContainText("packet uploaded");

  const [stored, ...rest] = await packetsForMandate(request, mandateId);
  expect(rest).toHaveLength(0);
  expect(stored).toMatchObject({
    mandateId,
    providerListingId: listing.id,
    encryptionMode: "mock",
  });
  expect(stored?.walrusBlobId).toMatch(/^mock:/);
  expect(stored?.packetHash).toMatch(/^0x[0-9a-f]{64}$/);
  expect(stored?.sizeBytes).toBeGreaterThan(0);

  // The privacy claim, checked against the provider's own copy: nothing the
  // renter typed is anywhere in the record it kept.
  const serialized = JSON.stringify(stored);
  expect(serialized).not.toContain(RENTER_NAME);
  expect(serialized).not.toContain(COVER_LETTER);
  expect(serialized).not.toContain(SALARY);
});

test("each selected listing gets its own packet and its own agent target", async ({
  page,
  request,
}) => {
  const mandateId = `0x${crypto.randomUUID().replace(/-/g, "").repeat(2)}`;
  const first = await createListing(request);
  const second = await createListing(request, { monthlyRentEur: 1600 });

  await seedMandate(page, mandateId);
  await page.goto("/renter");
  await page.getByRole("checkbox", { name: new RegExp(first.externalListingId) }).check();
  await page.getByRole("checkbox", { name: new RegExp(second.externalListingId) }).check();

  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();
  await expect(page.getByTestId(`packet-upload-status-${first.id}`)).toContainText("packet uploaded");
  await expect(page.getByTestId(`packet-upload-status-${second.id}`)).toContainText("ready to upload");
  await expect(page.getByTestId("batch-run-disabled")).toContainText(
    "Upload packets for all selected listings to continue.",
  );
  await expect(page.getByTestId("start-agent-run-link")).toHaveCount(0);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();
  await expect(page.getByTestId(`packet-upload-status-${second.id}`)).toContainText("packet uploaded");

  const stored = await packetsForMandate(request, mandateId);
  expect(stored.map((packet) => packet.providerListingId).sort()).toEqual(
    [first.id, second.id].sort(),
  );
  // Distinct ciphertext per listing — a shared blob would mean one packet was
  // registered twice under two keys.
  expect(new Set(stored.map((packet) => packet.walrusBlobId)).size).toBe(2);

  await expect(page.getByTestId("start-agent-run-link")).toHaveAttribute(
    "href",
    `/agent?mandateId=${encodeURIComponent(mandateId)}`,
  );
});
