import { describe, expect, it } from "vitest";
import {
  DEMO_LISTING_OBJECT_ID,
  INELIGIBLE_LISTING_OBJECT_ID,
  LIVE_AGENT_RUN,
  PACKAGE_ID,
  SMOKE,
  SMOKE_MANDATE_ID,
  SMOKE_RECEIPT_ID,
  UPGRADE_CAP_ID,
} from "./index.js";

/** A valid Sui object/address ID: "0x" followed by exactly 64 lowercase hex chars. */
const SUI_ID_RE = /^0x[0-9a-f]{64}$/;

function assertSuiId(id: string, name: string) {
  expect(id, `${name} must be a valid Sui object ID`).toMatch(SUI_ID_RE);
}

describe("contracts-config ID format", () => {
  it("PACKAGE_ID is a valid Sui ID", () => {
    assertSuiId(PACKAGE_ID, "PACKAGE_ID");
  });

  it("UPGRADE_CAP_ID is a valid Sui ID", () => {
    assertSuiId(UPGRADE_CAP_ID, "UPGRADE_CAP_ID");
  });

  it("SMOKE object IDs are valid", () => {
    assertSuiId(SMOKE.mandateId, "SMOKE.mandateId");
    assertSuiId(SMOKE.ownerCapId, "SMOKE.ownerCapId");
    assertSuiId(SMOKE.agentCapId, "SMOKE.agentCapId");
    assertSuiId(SMOKE.listingObjectId, "SMOKE.listingObjectId");
    assertSuiId(SMOKE.receiptId, "SMOKE.receiptId");
  });

  it("LIVE_AGENT_RUN object IDs are valid", () => {
    assertSuiId(LIVE_AGENT_RUN.mandateId, "LIVE_AGENT_RUN.mandateId");
    assertSuiId(LIVE_AGENT_RUN.ownerCapId, "LIVE_AGENT_RUN.ownerCapId");
    assertSuiId(LIVE_AGENT_RUN.agentCapId, "LIVE_AGENT_RUN.agentCapId");
    assertSuiId(LIVE_AGENT_RUN.listingObjectId, "LIVE_AGENT_RUN.listingObjectId");
    assertSuiId(LIVE_AGENT_RUN.receiptId, "LIVE_AGENT_RUN.receiptId");
    assertSuiId(LIVE_AGENT_RUN.ineligibleListingObjectId, "LIVE_AGENT_RUN.ineligibleListingObjectId");
  });

  it("flat aliases match their sources", () => {
    expect(DEMO_LISTING_OBJECT_ID).toBe(SMOKE.listingObjectId);
    expect(INELIGIBLE_LISTING_OBJECT_ID).toBe(LIVE_AGENT_RUN.ineligibleListingObjectId);
    expect(SMOKE_MANDATE_ID).toBe(SMOKE.mandateId);
    expect(SMOKE_RECEIPT_ID).toBe(SMOKE.receiptId);
  });

  it("INELIGIBLE_LISTING_OBJECT_ID is the real Porto object, not a placeholder", () => {
    // The fake placeholder was 0x1000...0006 — assert it is gone.
    expect(INELIGIBLE_LISTING_OBJECT_ID).not.toBe(
      "0x1000000000000000000000000000000000000000000000000000000000000006",
    );
    // The real Porto listing on testnet:
    expect(INELIGIBLE_LISTING_OBJECT_ID).toBe(
      "0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1",
    );
  });

  it("Lisbon and Porto listing IDs are different", () => {
    expect(DEMO_LISTING_OBJECT_ID).not.toBe(INELIGIBLE_LISTING_OBJECT_ID);
  });
});
