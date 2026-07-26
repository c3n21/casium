/**
 * Agent operator E2E coverage for the current live-demo flow.
 *
 * The stubbed tier mirrors the manual QA flow without wallet, Sui, World, or
 * Walrus dependencies: selected listings come from localStorage, packet records
 * come from the provider stub, and /runs is handled by the agent stub.
 */

import { ACTIVE_AGENT_MANDATE, LIVE_AGENT_RUN } from "@casium/contracts-config";
import { expect, test } from "../src/fixtures/test.js";
import { LISBON_LISTING, LISBON_SECOND_LISTING, PORTO_LISTING } from "../src/fixtures/data.js";
import { seedMandateSession, seedSelectedListings } from "../src/fixtures/session.js";
import type { Page } from "@playwright/test";

/**
 * The live run section. Its heading names the current selection
 * (e.g. "Run: porto-demo-1"), so match the prefix — which also excludes the
 * archived "Smoke run: …" sections.
 */
function runSection(page: Page) {
  return page.getByTestId("active-run-section");
}

function packet(providerListingId: string, walrusBlobId: string) {
  return {
    mandateId: ACTIVE_AGENT_MANDATE.mandateId,
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

    await expect(page.getByTestId("agent-health-status")).toContainText("Agent online");
    await expect(page.getByTestId("agentkit-mode")).toContainText("mock");
  });

  test("shows no-run guidance when no mandate has been handed off", async ({ page }) => {
    await page.goto("/agent");

    await expect(page.getByTestId("no-mandate-empty")).toContainText("No active mandate.");
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

    await expect(page.getByText("lisbon-demo-1, lisbon-demo-2", { exact: true })).toBeVisible();
    const section = runSection(page);
    await expect(
      section.getByRole("heading", { name: "Run: lisbon-demo-1, lisbon-demo-2" }),
    ).toBeVisible();
    await expect(section.getByRole("textbox")).toHaveValue(ACTIVE_AGENT_MANDATE.mandateId);

    await section.getByRole("button", { name: "Start run" }).click();
    await expect(section.getByRole("button", { name: "Running…" })).toBeDisabled();

    await expect(section.getByTestId("run-status")).toHaveAttribute("data-status", "complete", {
      timeout: 20_000,
    });
    await expect(section.getByText("Per-listing results:")).toBeVisible();
    // `exact` keeps these off the section heading, which names the same listings.
    await expect(
      section.getByText(LISBON_LISTING.externalListingId, { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByText(LISBON_SECOND_LISTING.externalListingId, { exact: true }),
    ).toBeVisible();

    const txLink = section.getByRole("link", {
      name: new RegExp(LIVE_AGENT_RUN.submitApplicationTxDigest.slice(0, 12)),
    });
    await expect(txLink).toHaveAttribute(
      "href",
      `https://testnet.suivision.xyz/txblock/${LIVE_AGENT_RUN.submitApplicationTxDigest}`,
    );

    expect(agentApi.startedRuns()).toEqual([
      {
        mandateId: ACTIVE_AGENT_MANDATE.mandateId,
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

  test("names the selected listing rather than the Lisbon default", async ({
    page,
    providerApi,
    agentApi,
  }) => {
    agentApi.setScript("ineligible");
    providerApi.setPackets([packet(PORTO_LISTING.id, "mock:porto-listing-packet")]);
    await seedMandateSession(page);
    await seedSelectedListings(page, [PORTO_LISTING]);

    await page.goto("/agent");

    const section = runSection(page);
    await expect(
      section.getByRole("heading", { name: `Run: ${PORTO_LISTING.externalListingId}` }),
    ).toBeVisible();
    // The old hardcoded title must be gone — a Porto run under a "Lisbon" heading
    // is what this test guards against. (`exact` keeps the archived "Smoke run: …"
    // heading, which contains the same words, out of the count.)
    await expect(
      page.getByRole("heading", { name: "Run: Eligible listing (Lisbon)", exact: true }),
    ).toHaveCount(0);

    await section.getByRole("button", { name: "Start run" }).click();
    await expect(section.getByTestId("run-status")).toHaveAttribute("data-status", "ineligible", {
      timeout: 20_000,
    });

    expect(agentApi.startedRuns()).toEqual([
      {
        mandateId: ACTIVE_AGENT_MANDATE.mandateId,
        targets: [
          {
            providerListingId: PORTO_LISTING.id,
            listingObjectId: PORTO_LISTING.listingObjectId,
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
      `No packet is registered for target ${LISBON_SECOND_LISTING.externalListingId}.`,
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
