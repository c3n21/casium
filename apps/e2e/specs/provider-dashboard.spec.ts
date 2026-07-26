/**
 * RD-145 — Flow F2: the provider dashboard listings table and Sui receipt
 * verification (Step 8 of docs/demo-script.md).
 */

import { SMOKE } from "@casium/contracts-config";
import { expect, test } from "../src/fixtures/test.js";
import {
  LISBON_SECOND_LISTING,
  RESERVED_APPLICATION,
  VERIFY_INPUT,
} from "../src/fixtures/data.js";

test.describe("listings table", () => {
  test("renders the eligible Lisbon row and the ineligible Porto row", async ({ page }) => {
    await page.goto("/provider");

    const lisbon = page.getByRole("row", { name: /listing_lisbon_eligible/ });
    await expect(lisbon).toContainText("Lisbon");
    await expect(lisbon).toContainText("€1700");
    await expect(lisbon).toContainText("Active");

    const porto = page.getByRole("row", { name: /listing_porto_ineligible/ });
    await expect(porto).toContainText("Porto (ineligible demo)");
    await expect(porto).toContainText("Ineligible");
  });

  test("shows the empty state when the provider has no listings", async ({
    page,
    providerApi,
  }) => {
    providerApi.setListings([]);
    await page.goto("/provider");

    await expect(page.getByText("No listings yet.")).toBeVisible();
  });

  test("surfaces a provider API failure instead of rendering an empty table", async ({
    page,
    providerApi,
  }) => {
    providerApi.failListings(true);
    await page.goto("/provider");

    await expect(page.getByText(/Error loading listings:/)).toBeVisible();
  });
});

test.describe("application inbox", () => {
  test("shows the empty state when no application has been submitted", async ({ page }) => {
    await page.goto("/provider");

    await expect(
      page.getByText("No applications yet. The agent will populate this once it submits."),
    ).toBeVisible();
  });

  test("verifying a Sui receipt moves the application to accepted", async ({
    page,
    providerApi,
  }) => {
    providerApi.setApplications([RESERVED_APPLICATION]);
    await page.goto("/provider");

    const card = page.locator("div").filter({ hasText: /^app_1/ }).first();
    await expect(page.getByText("reserved")).toBeVisible();
    await expect(page.getByText(/Human:/)).toBeVisible();

    await page.locator("summary", { hasText: "Verify Sui receipt" }).click();
    await page.getByPlaceholder("tx digest").fill(VERIFY_INPUT.txDigest);
    await page.getByPlaceholder("receipt object ID (0x...)").fill(VERIFY_INPUT.receiptId);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByText("accepted")).toBeVisible();
    await expect(page.getByText(/✅ Receipt:/)).toBeVisible();
    await expect(card.getByRole("link", { name: "view tx" })).toHaveAttribute(
      "href",
      new RegExp(`testnet\\.suivision\\.xyz/txblock/${VERIFY_INPUT.txDigest}`),
    );
  });

  test("a rejected receipt keeps the application reserved and shows the error", async ({
    page,
    providerApi,
  }) => {
    providerApi.setApplications([RESERVED_APPLICATION]);
    providerApi.failVerify(true);
    await page.goto("/provider");

    await page.locator("summary", { hasText: "Verify Sui receipt" }).click();
    await page.getByPlaceholder("tx digest").fill("not-a-real-digest");
    await page.getByPlaceholder("receipt object ID (0x...)").fill(SMOKE.receiptId);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByText("RECEIPT_INVALID")).toBeVisible();
    await expect(page.getByText("reserved")).toBeVisible();
    await expect(page.getByText("accepted")).toHaveCount(0);
  });

  test("shows both accepted applications from a multi-target run", async ({
    page,
    providerApi,
  }) => {
    providerApi.setApplications([
      {
        ...RESERVED_APPLICATION,
        status: "accepted",
        receipt: VERIFY_INPUT,
      },
      {
        ...RESERVED_APPLICATION,
        id: "app_2",
        listingId: LISBON_SECOND_LISTING.id,
        listingObjectId: LISBON_SECOND_LISTING.listingObjectId,
        walrusBlobId: "mock:second-listing-packet",
        idempotencyKey: "idem-e2e-2",
        status: "accepted",
        receipt: VERIFY_INPUT,
      },
    ]);

    await page.goto("/provider");

    await expect(page.getByText("app_1")).toBeVisible();
    await expect(page.getByText("app_2")).toBeVisible();
    await expect(page.getByText("accepted")).toHaveCount(2);
    await expect(page.getByText(/mock:second-listing/)).toBeVisible();
  });
});
