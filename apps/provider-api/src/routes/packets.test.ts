import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const BASE_PACKET = {
  mandateId: "mandate_test_001",
  providerListingId: "listing_lisbon_eligible",
  walrusBlobId: "blob_abc123",
  packetHash: "hash_abc123",
  sizeBytes: 1024,
  encryptionMode: "seal" as const,
};

describe("packet routes", () => {
  describe("POST /packets", () => {
    it("stores a packet with providerListingId and returns 201", async () => {
      const app = createApp();
      const res = await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(BASE_PACKET),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        mandateId: "mandate_test_001",
        providerListingId: "listing_lisbon_eligible",
        walrusBlobId: "blob_abc123",
        packetHash: "hash_abc123",
        sizeBytes: 1024,
        encryptionMode: "seal",
      });
      expect(typeof body.registeredAtMs).toBe("number");
    });

    it("defaults providerListingId to listing_lisbon_eligible when omitted", async () => {
      const app = createApp();
      const { providerListingId: _omit, ...withoutListing } = BASE_PACKET;
      const res = await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withoutListing),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.providerListingId).toBe("listing_lisbon_eligible");
    });

    it("returns 422 for invalid payload", async () => {
      const app = createApp();
      const res = await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId: "" }),
      });
      expect(res.status).toBe(422);
    });

    it("stores two packets for same mandate with different providerListingId independently", async () => {
      const app = createApp();

      const packet1 = { ...BASE_PACKET, providerListingId: "listing_lisbon_eligible", walrusBlobId: "blob_lisbon" };
      const packet2 = {
        ...BASE_PACKET,
        providerListingId: "listing_porto_ineligible",
        walrusBlobId: "blob_porto",
        packetHash: "hash_porto",
      };

      const r1 = await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(packet1),
      });
      const r2 = await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(packet2),
      });

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);

      // Verify each is retrievable independently
      const get1 = await app.request(
        `/packets/${packet1.mandateId}/${packet1.providerListingId}`,
      );
      const get2 = await app.request(
        `/packets/${packet2.mandateId}/${packet2.providerListingId}`,
      );

      expect((await get1.json()).walrusBlobId).toBe("blob_lisbon");
      expect((await get2.json()).walrusBlobId).toBe("blob_porto");
    });
  });

  describe("GET /packets/:mandateId/:providerListingId", () => {
    it("returns the exact packet for the given mandate+listing pair", async () => {
      const app = createApp();
      await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(BASE_PACKET),
      });

      const res = await app.request(
        `/packets/${BASE_PACKET.mandateId}/${BASE_PACKET.providerListingId}`,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        mandateId: BASE_PACKET.mandateId,
        providerListingId: BASE_PACKET.providerListingId,
        walrusBlobId: BASE_PACKET.walrusBlobId,
      });
    });

    it("returns 404 when exact pair not found", async () => {
      const app = createApp();
      const res = await app.request("/packets/mandate_missing/listing_missing");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /packets/:mandateId (backward-compat)", () => {
    it("returns the listing_lisbon_eligible packet when no listing param given", async () => {
      const app = createApp();
      await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...BASE_PACKET, providerListingId: "listing_lisbon_eligible" }),
      });

      const res = await app.request(`/packets/${BASE_PACKET.mandateId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providerListingId).toBe("listing_lisbon_eligible");
      expect(body.mandateId).toBe(BASE_PACKET.mandateId);
    });

    it("falls back to first available packet if listing_lisbon_eligible not set", async () => {
      const app = createApp();
      const otherListing = { ...BASE_PACKET, providerListingId: "listing_porto_ineligible", mandateId: "mandate_fallback" };
      await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(otherListing),
      });

      const res = await app.request(`/packets/${otherListing.mandateId}`);
      expect(res.status).toBe(200);
      expect((await res.json()).mandateId).toBe(otherListing.mandateId);
    });

    it("returns 404 when mandate has no packets", async () => {
      const app = createApp();
      const res = await app.request("/packets/mandate_nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /packets/by-mandate/:mandateId", () => {
    it("returns all packets for a mandate as an array", async () => {
      const app = createApp();
      const mandateId = "mandate_multi";

      await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...BASE_PACKET, mandateId, providerListingId: "listing_lisbon_eligible", walrusBlobId: "blob_a" }),
      });
      await app.request("/packets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...BASE_PACKET,
          mandateId,
          providerListingId: "listing_porto_ineligible",
          walrusBlobId: "blob_b",
          packetHash: "hash_b",
        }),
      });

      const res = await app.request(`/packets/by-mandate/${mandateId}`);
      expect(res.status).toBe(200);
      const { packets } = await res.json() as { packets: Array<{ providerListingId: string; walrusBlobId: string }> };
      expect(packets).toHaveLength(2);
      const listingIds = packets.map((p) => p.providerListingId).sort();
      expect(listingIds).toEqual(["listing_lisbon_eligible", "listing_porto_ineligible"]);
    });

    it("returns empty array when mandate has no packets", async () => {
      const app = createApp();
      const res = await app.request("/packets/by-mandate/mandate_empty_xyz");
      expect(res.status).toBe(200);
      const body = await res.json() as { packets: unknown[] };
      expect(body.packets).toHaveLength(0);
    });
  });
});
