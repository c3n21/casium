/**
 * RD-147 — Flow F4: agent operator runs.
 *
 * This is the pitch: the agent completes an in-scope run and refuses the
 * out-of-scope Porto listing. Both RunSections render identical labels, so
 * every locator is scoped to its section by heading text.
 */

import { INELIGIBLE_LISTING_OBJECT_ID, LIVE_AGENT_RUN, SMOKE } from "@rentdelegate/contracts-config";
import { expect, test } from "../src/fixtures/test.js";
import type { Page } from "@playwright/test";

const ELIGIBLE = "Run: Eligible listing (Lisbon)";
const INELIGIBLE = "Ineligible listing proof (Porto)";

/** Scope to one RunSection — the page renders two with identical controls. */
function section(page: Page, heading: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
}

/**
 * Result status must be matched exactly. Playwright's default text matching is
 * a case-insensitive substring, and each section's own description ends with
 * "Expect status: complete." / "Expect status: ineligible." — so a loose match
 * passes whether or not the run ever produced a result.
 */
function resultStatus(page: Page, heading: string, status: string) {
  return section(page, heading).getByText(`Status: ${status}`, { exact: true });
}

test.describe("agent operator", () => {
  test("reports the agent as online with its address and agentkit mode", async ({ page }) => {
    await page.goto("/agent");

    await expect(page.getByText("Agent online")).toBeVisible();
    await expect(page.getByText("agentkit: mock")).toBeVisible();
  });

  test("shows an offline banner when the agent service is unreachable", async ({
    page,
    agentApi,
  }) => {
    agentApi.setOffline(true);
    await page.goto("/agent");

    await expect(page.getByText(/Agent offline:/)).toBeVisible();
  });

  test("eligible run reaches status complete with tx and receipt links", async ({
    page,
    agentApi,
  }) => {
    await page.goto("/agent");
    const eligible = section(page, ELIGIBLE);

    // The mandate input is pre-filled with the smoke mandate.
    await expect(eligible.getByRole("textbox")).toHaveValue(SMOKE.mandateId);

    await eligible.getByRole("button", { name: "Start run" }).click();
    await expect(eligible.getByRole("button", { name: "Running…" })).toBeDisabled();

    // The page polls every 2 s, so allow two cycles rather than sleeping.
    await expect(resultStatus(page, ELIGIBLE, "complete")).toBeVisible({ timeout: 20_000 });
    await expect(eligible.getByText("Application ID:")).toBeVisible();
    await expect(eligible.getByText(/Blob ID:/)).toBeVisible();

    // Explorer links must point at the testnet subdomain (guards commit 01bde65).
    const txLink = eligible.getByRole("link", {
      name: new RegExp(LIVE_AGENT_RUN.submitApplicationTxDigest.slice(0, 12)),
    });
    await expect(txLink).toHaveAttribute(
      "href",
      `https://testnet.suivision.xyz/txblock/${LIVE_AGENT_RUN.submitApplicationTxDigest}`,
    );

    const receiptLink = eligible.getByRole("link", {
      name: new RegExp(LIVE_AGENT_RUN.receiptId.slice(0, 12)),
    });
    await expect(receiptLink).toHaveAttribute(
      "href",
      `https://testnet.suivision.xyz/object/${LIVE_AGENT_RUN.receiptId}`,
    );

    // The run was started for the smoke mandate, with no listing override.
    expect(agentApi.startedRuns()).toHaveLength(1);
    expect(agentApi.startedRuns()[0]?.mandateId).toBe(SMOKE.mandateId);
    expect(agentApi.startedRuns()[0]?.listingObjectId).toBeUndefined();
  });

  test("Porto run is refused as ineligible, with a reason and no tx link", async ({
    page,
    agentApi,
  }) => {
    agentApi.setScript("ineligible");
    await page.goto("/agent");
    const porto = section(page, INELIGIBLE);

    await expect(porto.getByRole("link", { name: /…/ })).toHaveAttribute(
      "href",
      new RegExp(INELIGIBLE_LISTING_OBJECT_ID),
    );

    await porto.getByRole("button", { name: "Start run" }).click();

    await expect(resultStatus(page, INELIGIBLE, "ineligible")).toBeVisible({ timeout: 20_000 });
    await expect(porto.getByText(/Reason:/)).toBeVisible();
    await expect(porto.getByText(/^Tx:/)).toHaveCount(0);
    await expect(resultStatus(page, INELIGIBLE, "complete")).toHaveCount(0);

    // The ineligible section overrides the listing — that override is the proof.
    expect(agentApi.startedRuns()[0]?.listingObjectId).toBe(INELIGIBLE_LISTING_OBJECT_ID);
  });

  test("a run that throws surfaces the failure instead of claiming success", async ({
    page,
    agentApi,
  }) => {
    agentApi.setScript("failed");
    await page.goto("/agent");
    const eligible = section(page, ELIGIBLE);

    await eligible.getByRole("button", { name: "Start run" }).click();

    await expect(eligible.getByText(/Run failed:/)).toBeVisible({ timeout: 20_000 });
    await expect(resultStatus(page, ELIGIBLE, "complete")).toHaveCount(0);
  });

  test("a rejected start request is reported and re-enables the button", async ({
    page,
    agentApi,
  }) => {
    agentApi.failStart(true);
    await page.goto("/agent");
    const eligible = section(page, ELIGIBLE);

    await eligible.getByRole("button", { name: "Start run" }).click();

    await expect(eligible.getByRole("alert")).toContainText("Agent returned 500");
    await expect(eligible.getByRole("button", { name: "Start run" })).toBeEnabled();
  });
});
