import { makeSyntheticPacket, PacketDocumentSchema, SYNTHETIC_PACKET_DEFAULTS } from "@casium/shared";
import { describe, expect, it } from "vitest";

describe("PacketDocument schema", () => {
  it("parses the default synthetic packet", () => {
    const result = PacketDocumentSchema.safeParse({ ...SYNTHETIC_PACKET_DEFAULTS, createdAtMs: Date.now() });
    expect(result.success).toBe(true);
  });

  it("makeSyntheticPacket produces a valid packet with timestamp", () => {
    const packet = makeSyntheticPacket();
    expect(packet.synthetic).toBe(true);
    expect(packet.type).toBe("rental_application_packet");
    expect(packet.createdAtMs).toBeGreaterThan(0);
  });

  it("rejects non-synthetic or unknown employment type", () => {
    expect(PacketDocumentSchema.safeParse({ ...SYNTHETIC_PACKET_DEFAULTS, synthetic: false }).success).toBe(false);
    expect(
      PacketDocumentSchema.safeParse({ ...SYNTHETIC_PACKET_DEFAULTS, employmentType: "intern" }).success,
    ).toBe(false);
  });
});
