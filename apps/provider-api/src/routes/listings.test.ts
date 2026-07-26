import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("listing routes", () => {
  it("lists seeded eligible and ineligible demo listings", async () => {
    const app = createApp();
    const response = await app.request("/listings");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.listings).toHaveLength(2);
    expect(body.listings.map((listing: { id: string }) => listing.id)).toEqual([
      "listing_lisbon_eligible",
      "listing_porto_ineligible",
    ]);
    expect(body.listings[0].listingObjectId).toMatch(/^0x/);
  });

  it("returns listing detail and 404 for missing listings", async () => {
    const app = createApp();

    const found = await app.request("/listings/listing_lisbon_eligible");
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      id: "listing_lisbon_eligible",
      municipalityCode: 1,
    });

    const missing = await app.request("/listings/missing");
    expect(missing.status).toBe(404);
  });

  it("creates a listing with provider-authored Sui object fields", async () => {
    const app = createApp();
    const response = await app.request("/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "listing_oeiras_new",
        listingObjectId: "0x4000000000000000000000000000000000000000000000000000000000000004",
        externalListingId: "oeiras-demo-1",
        providerSuiAddress: "0x2000000000000000000000000000000000000000000000000000000000000002",
        landlordSuiAddress: "0x3000000000000000000000000000000000000000000000000000000000000003",
        municipalityCode: 2,
        monthlyRentEur: 1600,
        bedrooms: 1,
        active: true,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "listing_oeiras_new",
      listingObjectId: "0x4000000000000000000000000000000000000000000000000000000000000004",
    });
  });

  it("rejects EVM-shaped addresses in Sui address fields", async () => {
    const app = createApp();
    const response = await app.request("/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "listing_bad_landlord",
        listingObjectId: "0x4000000000000000000000000000000000000000000000000000000000000004",
        externalListingId: "bad-landlord-1",
        providerSuiAddress: "0x2000000000000000000000000000000000000000000000000000000000000002",
        landlordSuiAddress: "0x1234567890123456789012345678901234567890",
        municipalityCode: 2,
        monthlyRentEur: 1600,
        bedrooms: 1,
        active: true,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("40-hex EVM address"),
    });
  });
});
