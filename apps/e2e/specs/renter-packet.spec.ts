/**
 * RD-146 — Flow F3: encrypt and upload the application packet.
 *
 * The assertion that matters is the privacy one: the provider API receives a
 * blob ID and a hash, and nothing the renter typed. This spec fails if anyone
 * adds a plaintext field to the registration body.
 *
 * No wallet is needed — the AES-GCM path never touches a connected account.
 */

import { SMOKE } from "@rentdelegate/contracts-config";
import { expect, test } from "../src/fixtures/test.js";

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
  await page.goto("/renter");

  await expect(page.getByText("Synthetic data only.")).toBeVisible();
  await expect(
    page.getByText("[MOCK encryption — AES-GCM, key in browser only]"),
  ).toBeVisible();

  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();

  await expect(page.getByText("Packet uploaded")).toBeVisible();
  await expect(page.getByText(/^mock:/)).toBeVisible();
  await expect(
    page.getByText("Only ciphertext was uploaded. Plaintext never sent to provider API."),
  ).toBeVisible();

  const registrations = providerApi.packetRegistrations();
  expect(registrations).toHaveLength(1);
  expect(registrations[0]?.mandateId).toBe(SMOKE.mandateId);
  expect(registrations[0]?.walrusBlobId).toMatch(/^mock:/);
  expect(registrations[0]?.packetHash).toMatch(/^0x[0-9a-f]{64}$/);
  expect(registrations[0]?.sizeBytes).toBeGreaterThan(0);
});

test("the provider registration carries no plaintext from the form", async ({
  page,
  providerApi,
}) => {
  await page.goto("/renter");
  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();
  await expect(page.getByText("Packet uploaded")).toBeVisible();

  const [registration] = providerApi.packetRegistrations();
  expect(registration).toBeDefined();

  // Exactly these five fields — no more.
  expect(Object.keys(registration!).sort()).toEqual([
    "encryptionMode",
    "mandateId",
    "packetHash",
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
  await page.goto("/renter");

  await fillPacketForm(page);
  await page.getByRole("button", { name: "Encrypt and upload packet" }).click();

  await expect(page.getByText(/Packet registration failed/)).toBeVisible();
  await expect(page.getByText("Packet uploaded")).toHaveCount(0);
});
