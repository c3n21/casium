import { describe, expect, it } from "vitest";
import { parseListing, parseMandate, parseReceipt } from "./objects.js";

describe("RentDelegate Sui object parsers", () => {
  it("parses mandate/listing/receipt JSON fields", () => {
    expect(
      parseMandate({
        id: { id: "0xmandate" },
        owner: "0xowner",
        agent_sui: "0xagent",
        max_monthly_rent_eur: "1800",
        allowed_municipalities: ["1", "2"],
        min_bedrooms: "1",
        expires_at_ms: "1790000000000",
        remaining_applications: "2",
        revoked: false,
        permitted_actions: "1",
      }),
    ).toMatchObject({ id: "0xmandate", remainingApplications: 2 });

    expect(
      parseListing({
        id: "0xlisting",
        provider: "0xprovider",
        landlord: "0xlandlord",
        municipality: "1",
        monthly_rent_eur: "1700",
        bedrooms: "2",
        active: true,
        expires_at_ms: "1790000000000",
      }),
    ).toMatchObject({ id: "0xlisting", monthlyRentEur: 1700 });

    expect(
      parseReceipt({
        id: "0xreceipt",
        mandate_id: "0xmandate",
        listing_id: "0xlisting",
        agent: "0xagent",
        provider: "0xprovider",
        landlord: "0xlandlord",
        walrus_blob_id: [109, 111, 99, 107, 58, 98, 108, 111, 98],
        packet_hash: [190, 239],
        submitted_at_ms: "1784962851988",
        access_expires_at_ms: "1790000000000",
        status: "1",
        world_ref_hash: [1, 2, 3],
      }),
    ).toMatchObject({ id: "0xreceipt", status: 1, packetHashBytes: [190, 239] });
  });
});
