import { describe, expect, it } from "vitest";
import { parseListing, parseMandate, parseReceipt } from "./objects.js";

const mandateBase = {
  id: { id: "0xmandate" },
  owner: "0xowner",
  agent_sui: "0xagent",
  agent_evm: [] as number[],
  max_monthly_rent_eur: "1800",
  allowed_municipalities: ["1", "2"],
  min_bedrooms: "1",
  expires_at_ms: "1790000000000",
  remaining_applications: "2",
  revoked: false,
  permitted_actions: "1",
};

describe("Casium Sui object parsers", () => {
  it("parses mandate/listing/receipt JSON fields", () => {
    expect(
      parseMandate(mandateBase),
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

describe("parseMandate — agent_evm field (RD-162)", () => {
  it("returns null for an empty vector (test mandate / field never set)", () => {
    const mandate = parseMandate({ ...mandateBase, agent_evm: [] });
    expect(mandate.agentEvm).toBeNull();
  });

  it("returns null when the field is missing from JSON", () => {
    const { agent_evm: _, ...withoutEvm } = mandateBase;
    const mandate = parseMandate(withoutEvm);
    expect(mandate.agentEvm).toBeNull();
  });

  it("normalises a 20-byte vector to lowercase 0x-prefixed hex", () => {
    // 20 bytes — 0x0102030405060708090a0b0c0d0e0f1011121314
    const bytes = Array.from({ length: 20 }, (_, i) => i + 1);
    const mandate = parseMandate({ ...mandateBase, agent_evm: bytes });
    expect(mandate.agentEvm).toBe("0x0102030405060708090a0b0c0d0e0f1011121314");
  });

  it("decodes a base64 vector from Sui gRPC JSON", () => {
    const mandate = parseMandate({
      ...mandateBase,
      agent_evm: "Zi26u+/5sjdJC75qiYd2pKHYfM4=",
    });

    expect(mandate.agentEvm).toBe("0x662dbabbeff9b237490bbe6a898776a4a1d87cce");
  });

  it("lowercases hex digits", () => {
    // 0xABCDEF... → must be lowercase
    const bytes = [0xab, 0xcd, 0xef, ...Array(17).fill(0x00)];
    const mandate = parseMandate({ ...mandateBase, agent_evm: bytes });
    expect(mandate.agentEvm).toBe("0xabcdef" + "00".repeat(17));
  });

  it("keeps wrong-length byte arrays unpadded (not truncated)", () => {
    // 19 bytes — should produce a 38-hex-char string, not fail
    const bytes = Array.from({ length: 19 }, (_, i) => i + 1);
    const mandate = parseMandate({ ...mandateBase, agent_evm: bytes });
    expect(mandate.agentEvm).toBe(
      "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
    expect(mandate.agentEvm?.length).toBe(2 + 19 * 2); // "0x" + 38 hex chars
  });

  it("keeps a 21-byte array without truncation", () => {
    const bytes = Array.from({ length: 21 }, (_, i) => i);
    const mandate = parseMandate({ ...mandateBase, agent_evm: bytes });
    expect(mandate.agentEvm?.length).toBe(2 + 21 * 2);
  });
});
