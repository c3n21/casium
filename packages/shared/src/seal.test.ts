import { deriveSealIdentity, identityToHex } from "@rentdelegate/shared";
import { describe, expect, it } from "vitest";

const MANDATE_A = "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee";
const LISTING_A = "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a";
const MANDATE_B = "0x16de4b28830417bea4becaa591671ca69024fea9d99d355c9c8784e468dcc454";
const LISTING_B = "0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1";

describe("deriveSealIdentity", () => {
  it("returns exactly 64 bytes", () => {
    const id = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    expect(id).toBeInstanceOf(Uint8Array);
    expect(id.byteLength).toBe(64);
  });

  it("is deterministic — same inputs always produce the same bytes", () => {
    const a = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    const b = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    expect(identityToHex(a)).toBe(identityToHex(b));
  });

  it("first 32 bytes encode the mandate ID, last 32 bytes encode the listing ID", () => {
    const identity = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    const hex = identityToHex(identity);
    const mandateHex = MANDATE_A.slice(2).toLowerCase();
    const listingHex = LISTING_A.slice(2).toLowerCase();
    expect(hex.slice(0, 64)).toBe(mandateHex);
    expect(hex.slice(64, 128)).toBe(listingHex);
  });

  it("different mandate IDs produce different identities", () => {
    const a = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    const b = deriveSealIdentity({ mandateId: MANDATE_B, listingObjectId: LISTING_A });
    expect(identityToHex(a)).not.toBe(identityToHex(b));
  });

  it("different listing IDs produce different identities", () => {
    const a = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    const b = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_B });
    expect(identityToHex(a)).not.toBe(identityToHex(b));
  });

  it("swapping mandate and listing produces a different identity (order matters)", () => {
    const normal = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_B });
    const swapped = deriveSealIdentity({ mandateId: LISTING_B, listingObjectId: MANDATE_A });
    // MANDATE_A != LISTING_B so the byte sequences will differ
    expect(identityToHex(normal)).not.toBe(identityToHex(swapped));
  });

  it("all four (mandate, listing) pairs produce distinct identities", () => {
    const pairs = [
      { mandateId: MANDATE_A, listingObjectId: LISTING_A },
      { mandateId: MANDATE_A, listingObjectId: LISTING_B },
      { mandateId: MANDATE_B, listingObjectId: LISTING_A },
      { mandateId: MANDATE_B, listingObjectId: LISTING_B },
    ];
    const identities = pairs.map((p) => identityToHex(deriveSealIdentity(p)));
    const unique = new Set(identities);
    expect(unique.size).toBe(4);
  });

  it("accepts hex strings without 0x prefix", () => {
    const withPrefix = deriveSealIdentity({ mandateId: MANDATE_A, listingObjectId: LISTING_A });
    const withoutPrefix = deriveSealIdentity({
      mandateId: MANDATE_A.slice(2),
      listingObjectId: LISTING_A.slice(2),
    });
    expect(identityToHex(withPrefix)).toBe(identityToHex(withoutPrefix));
  });

  it("left-pads short hex strings to 32 bytes", () => {
    // A short address like 0x1 should be treated as 0x000...001
    const id = deriveSealIdentity({ mandateId: "0x1", listingObjectId: LISTING_A });
    expect(id.byteLength).toBe(64);
    // First 31 bytes should be zero, 32nd byte should be 1
    expect(id[30]).toBe(0);
    expect(id[31]).toBe(1);
  });

  it("throws on invalid hex characters", () => {
    expect(() =>
      deriveSealIdentity({ mandateId: "0xGGGG", listingObjectId: LISTING_A }),
    ).toThrow();
  });

  it("throws when mandate ID exceeds 32 bytes (65 hex chars after 0x)", () => {
    const tooBig = "0x" + "a".repeat(66);
    expect(() =>
      deriveSealIdentity({ mandateId: tooBig, listingObjectId: LISTING_A }),
    ).toThrow();
  });
});
