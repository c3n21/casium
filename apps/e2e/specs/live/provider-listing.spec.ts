/**
 * Flow 1 — the provider publishes listings, and every other role reads them
 * back from the same real API.
 *
 * Scope note: `POST /listings` writes the provider's own record. Creating the
 * on-chain `RentalListing` object is a wallet-signed transaction and belongs to
 * the wallet tier (RD-150). What is asserted here is that the mapping the whole
 * demo keys off — provider listing ID ↔ Sui object ID — survives the round trip
 * and reaches the dashboards.
 */

import { MUNICIPALITIES } from "@casium/shared";
import { INELIGIBLE_LISTING_OBJECT_ID, SMOKE } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { createListing, listListings } from "../../src/live/providerApi.js";
import { seedMandate } from "../../src/live/session.js";

test("the seeded demo listings are served by the real API", async ({ request }) => {
  const listings = await listListings(request);
  const byId = new Map(listings.map((listing) => [listing.id, listing]));

  expect(byId.get("listing_lisbon_eligible")).toMatchObject({
    externalListingId: "lisbon-demo-1",
    listingObjectId: SMOKE.listingObjectId,
    municipalityCode: MUNICIPALITIES.LISBON,
    monthlyRentEur: 1700,
    bedrooms: 2,
    active: true,
  });
  expect(byId.get("listing_porto_ineligible")).toMatchObject({
    externalListingId: "porto-demo-1",
    listingObjectId: INELIGIBLE_LISTING_OBJECT_ID,
    municipalityCode: MUNICIPALITIES.PORTO_INELIGIBLE_DEMO,
    active: true,
  });
});

test("the provider dashboard renders the seeded listings from the live API", async ({ page }) => {
  await page.goto("/provider");

  await expect(page.getByRole("heading", { name: "Provider Dashboard", level: 1 })).toBeVisible();
  // The table's first column is the provider's internal ID, so rows are named
  // by that — not by the external listing ID shown elsewhere in the app.
  await expect(page.getByTestId("listing-row-listing_lisbon_eligible")).toContainText("Active");
  await expect(page.getByTestId("listing-row-listing_porto_ineligible")).toContainText(
    "Ineligible",
  );
});

test("a newly created listing appears in the dashboard and keeps its Sui object ID", async ({
  page,
  request,
}) => {
  const created = await createListing(request, { monthlyRentEur: 1650, bedrooms: 3 });

  await page.goto("/provider");

  const row = page.getByTestId(`listing-row-${created.id}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("Lisbon");
  await expect(row).toContainText("€1650");
  await expect(row).toContainText("Active");

  // The mapping the agent depends on: the provider's own listing key resolves
  // to the shared on-chain object it will read during eligibility evaluation.
  const persisted = (await listListings(request)).find((listing) => listing.id === created.id);
  expect(persisted?.listingObjectId).toBe(SMOKE.listingObjectId);
});

test("the live API rejects an EVM-shaped landlord address in a Sui field", async ({ request }) => {
  const response = await request.post("http://localhost:4021/listings", {
    data: {
      id: `listing_bad_landlord_${crypto.randomUUID().slice(0, 8)}`,
      listingObjectId: SMOKE.listingObjectId,
      externalListingId: `bad-landlord-${crypto.randomUUID().slice(0, 8)}`,
      providerSuiAddress: "0x2",
      landlordSuiAddress: "0x1234567890123456789012345678901234567890",
      municipalityCode: MUNICIPALITIES.LISBON,
      monthlyRentEur: 1700,
      bedrooms: 2,
      active: true,
    },
  });

  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("40-hex EVM address"),
  });
});

test("the renter's target selector offers the live listings", async ({ page, request }) => {
  const created = await createListing(request, { monthlyRentEur: 1550, bedrooms: 2 });
  await seedMandate(page);

  await page.goto("/renter");

  await expect(page.getByRole("heading", { name: "Select target listings" })).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(created.externalListingId) }),
  ).toBeVisible();
});
