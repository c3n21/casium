/**
 * RD-146 — Flow F3: encrypt and upload the application packet.
 *
 * The assertion that matters is the privacy one: the provider API receives a
 * blob ID and a hash, and nothing the renter typed. This spec fails if anyone
 * adds a plaintext field to the registration body.
 *
 * No wallet is needed — the AES-GCM path never touches a connected account.
 */

import { LIVE_AGENT_RUN } from "@casium/contracts-config";
import { expect, test } from "../src/fixtures/test.js";
import { LISBON_LISTING, LISBON_SECOND_LISTING } from "../src/fixtures/data.js";
import { seedMandateSession } from "../src/fixtures/session.js";

const RENTER_NAME = "Zzz Synthetic Marker Name";
const COVER_LETTER = "Distinctive marker sentence that must never leave the browser.";
const SALARY = "4242";

async function fillPacketForm(page: import("@playwright/test").Page) {
  await page.getByLabel("Renter name (synthetic)").fill(RENTER_NAME);
  await page.getByLabel("Monthly net salary (EUR)").fill(SALARY);
  await page.getByLabel("Cover letter").fill(COVER_LETTER);
}

test("uploads an encrypted packet and shows the blob ID, hash and mock badge", async ({
  page,
  providerApi,
}) => {
  providerApi.setListings([LISBON_LISTING, LISBON_SECOND_LISTING]);
  await seedMandateSession(page);
  await page.goto("/renter");
  await page.getByRole("checkbox", { name: /lisbon-demo-1/ }).check();

  await expect(page.getByTestId("synthetic-data-badge")).toBeVisible();
  await expect(
    page.getByText("[MOCK encryption — AES-GCM, key in browser only]"),
  ).toBeVisible();

  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();

  await expect(page.getByTestId(`packet-uploaded-${LISBON_LISTING.id}`)).toBeVisible();
  await expect(page.getByText(/^mock:/)).toBeVisible();
  await expect(
    page.getByText("Only ciphertext was uploaded. Plaintext never sent to provider API."),
  ).toBeVisible();

  const registrations = providerApi.packetRegistrations();
  expect(registrations).toHaveLength(1);
  expect(registrations[0]?.mandateId).toBe(LIVE_AGENT_RUN.mandateId);
  expect(registrations[0]?.providerListingId).toBe(LISBON_LISTING.id);
  expect(registrations[0]?.walrusBlobId).toMatch(/^mock:/);
  expect(registrations[0]?.packetHash).toMatch(/^0x[0-9a-f]{64}$/);
  expect(registrations[0]?.sizeBytes).toBeGreaterThan(0);
});

test("the provider registration carries no plaintext from the form", async ({
  page,
  providerApi,
}) => {
  await seedMandateSession(page);
  await page.goto("/renter");
  await page.getByRole("checkbox", { name: /lisbon-demo-1/ }).check();
  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();
  await expect(page.getByTestId(`packet-uploaded-${LISBON_LISTING.id}`)).toBeVisible();

  const [registration] = providerApi.packetRegistrations();
  expect(registration).toBeDefined();

  // Exactly these six fields — no more.
  expect(Object.keys(registration!).sort()).toEqual([
    "encryptionMode",
    "mandateId",
    "packetHash",
    "providerListingId",
    "sizeBytes",
    "walrusBlobId",
  ]);

  // And nothing the renter typed, anywhere in the serialized body.
  const serialized = JSON.stringify(registration);
  expect(serialized).not.toContain(RENTER_NAME);
  expect(serialized).not.toContain(COVER_LETTER);
  expect(serialized).not.toContain(SALARY);
});

test("a rejected packet registration is surfaced to the renter", async ({
  page,
  providerApi,
}) => {
  providerApi.failPackets(true);
  await seedMandateSession(page);
  await page.goto("/renter");
  await page.getByRole("checkbox", { name: /lisbon-demo-1/ }).check();

  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();

  await expect(page.getByText(/Packet registration failed/)).toBeVisible();
  await expect(page.getByText("Packet uploaded")).toHaveCount(0);
});

test("uploads separate packets for each selected listing and saves the target handoff", async ({
  page,
  providerApi,
}) => {
  providerApi.setListings([LISBON_LISTING, LISBON_SECOND_LISTING]);
  await seedMandateSession(page);
  await page.goto("/renter");

  await page.getByRole("checkbox", { name: /lisbon-demo-1/ }).check();
  await page.getByRole("checkbox", { name: /lisbon-demo-2/ }).check();

  await expect(page.getByTestId(`packet-upload-status-${LISBON_LISTING.id}`)).toContainText("ready to upload");
  await expect(page.getByTestId(`packet-upload-status-${LISBON_SECOND_LISTING.id}`)).toContainText("waiting");

  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();
  await expect(page.getByTestId(`packet-upload-status-${LISBON_LISTING.id}`)).toContainText("packet uploaded");
  await expect(page.getByTestId(`packet-upload-status-${LISBON_SECOND_LISTING.id}`)).toContainText("ready to upload");
  await expect(page.getByTestId("batch-run-disabled")).toContainText(
    "Upload packets for all selected listings to continue.",
  );
  await expect(page.getByTestId("start-agent-run-link")).toHaveCount(0);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();
  await expect(page.getByTestId(`packet-upload-status-${LISBON_SECOND_LISTING.id}`)).toContainText("packet uploaded");

  const registrations = providerApi.packetRegistrations();
  expect(registrations.map((packet) => packet.providerListingId)).toEqual([
    LISBON_LISTING.id,
    LISBON_SECOND_LISTING.id,
  ]);

  await expect(page.getByTestId("start-agent-run-link")).toHaveAttribute(
    "href",
    `/agent?mandateId=${encodeURIComponent(LIVE_AGENT_RUN.mandateId)}`,
  );
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("casium:lastSelectedListings") ?? "[]")),
    )
    .toEqual([
      {
        providerListingId: LISBON_LISTING.id,
        listingObjectId: LISBON_LISTING.listingObjectId,
        externalListingId: LISBON_LISTING.externalListingId,
      },
      {
        providerListingId: LISBON_SECOND_LISTING.id,
        listingObjectId: LISBON_SECOND_LISTING.listingObjectId,
        externalListingId: LISBON_SECOND_LISTING.externalListingId,
      },
    ]);
});
