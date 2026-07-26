/**
 * Agent operator E2E coverage for the current live-demo flow.
 *
 * The stubbed tier mirrors the manual QA flow without wallet, Sui, World, or
 * Walrus dependencies: selected listings come from localStorage, packet records
 * come from the provider stub, and /runs is handled by the agent stub.
 */

import { LIVE_AGENT_RUN } from "@rentdelegate/contracts-config";
import { expect, test } from "../src/fixtures/test.js";
import { LISBON_LISTING, LISBON_SECOND_LISTING } from "../src/fixtures/data.js";
import { seedMandateSession, seedSelectedListings } from "../src/fixtures/session.js";
import type { Page } from "@playwright/test";

function runSection(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Run: Eligible listing (Lisbon)" }),
  });
}

function packet(providerListingId: string, walrusBlobId: string) {
  return {
    mandateId: LIVE_AGENT_RUN.mandateId,
    providerListingId,
    walrusBlobId,
    packetHash: `0x${"feedface".repeat(8)}`,
    sizeBytes: 861,
    encryptionMode: "mock",
  };
}

test.describe("agent operator", () => {
  test("reports the agent as online with its address and agentkit mode", async ({ page }) => {
    await page.goto("/agent");

    await expect(page.getByText("Agent online")).toBeVisible();
    await expect(page.getByText("agentkit: mock")).toBeVisible();
  });

  test("shows no-run guidance when no mandate has been handed off", async ({ page }) => {
    await page.goto("/agent");

    await expect(page.getByText("No active mandate.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start run" })).toHaveCount(0);
  });

  test("shows an offline banner when the agent service is unreachable", async ({
    page,
    agentApi,
  }) => {
    agentApi.setOffline(true);
    await page.goto("/agent");

    await expect(page.getByText(/Agent offline:/)).toBeVisible();
  });

  test("starts a multi-target run and renders per-listing results", async ({
    page,
    providerApi,
    agentApi,
  }) => {
    agentApi.setScript("multi-complete");
    providerApi.setPackets([
      packet(LISBON_LISTING.id, "mock:first-listing-packet"),
      packet(LISBON_SECOND_LISTING.id, "mock:second-listing-packet"),
    ]);
    await seedMandateSession(page);
    await seedSelectedListings(page, [LISBON_LISTING, LISBON_SECOND_LISTING]);

    await page.goto("/agent");

    await expect(page.getByText("listing_lisbon_eligible, listing_lisbon_second")).toBeVisible();
    const section = runSection(page);
    await expect(section.getByRole("textbox")).toHaveValue(LIVE_AGENT_RUN.mandateId);

    await section.getByRole("button", { name: "Start run" }).click();
    await expect(section.getByRole("button", { name: "Running…" })).toBeDisabled();

    await expect(section.getByText("Status: complete", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(section.getByText("Per-listing results:")).toBeVisible();
    await expect(section.getByText(LISBON_LISTING.id)).toBeVisible();
    await expect(section.getByText(LISBON_SECOND_LISTING.id)).toBeVisible();

    const txLink = section.getByRole("link", {
      name: new RegExp(LIVE_AGENT_RUN.submitApplicationTxDigest.slice(0, 12)),
    });
    await expect(txLink).toHaveAttribute(
      "href",
      `https://testnet.suivision.xyz/txblock/${LIVE_AGENT_RUN.submitApplicationTxDigest}`,
    );

    expect(agentApi.startedRuns()).toEqual([
      {
        mandateId: LIVE_AGENT_RUN.mandateId,
        targets: [
          {
            providerListingId: LISBON_LISTING.id,
            listingObjectId: LISBON_LISTING.listingObjectId,
          },
          {
            providerListingId: LISBON_SECOND_LISTING.id,
            listingObjectId: LISBON_SECOND_LISTING.listingObjectId,
          },
        ],
      },
    ]);
  });

  test("blocks a target run when one selected listing has no packet", async ({
    page,
    providerApi,
    agentApi,
  }) => {
    providerApi.setPackets([packet(LISBON_LISTING.id, "mock:first-listing-packet")]);
    await seedMandateSession(page);
    await seedSelectedListings(page, [LISBON_LISTING, LISBON_SECOND_LISTING]);

    await page.goto("/agent");
    await runSection(page).getByRole("button", { name: "Start run" }).click();

    await expect(runSection(page).getByRole("alert")).toContainText(
      `No packet is registered for target ${LISBON_SECOND_LISTING.id}.`,
    );
    expect(agentApi.startedRuns()).toEqual([]);
  });

  test("a rejected start request is reported and re-enables the button", async ({
    page,
    providerApi,
    agentApi,
  }) => {
    agentApi.failStart(true);
    providerApi.setPackets([packet(LISBON_LISTING.id, "mock:first-listing-packet")]);
    await seedMandateSession(page);
    await seedSelectedListings(page, [LISBON_LISTING]);

    await page.goto("/agent");
    const section = runSection(page);
    await section.getByRole("button", { name: "Start run" }).click();

    await expect(section.getByRole("alert")).toContainText("Agent returned 500");
    await expect(section.getByRole("button", { name: "Start run" })).toBeEnabled();
  });
});
