import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "./rules.js";
import type { RentalMandate, RentalListing } from "@casium/sui-client";

const BASE_MANDATE: RentalMandate = {
  id: "0xmandate",
  owner: "0xowner",
  agentSui: "0xagent",
  maxMonthlyRentEur: 2000,
  allowedMunicipalities: [1, 2],
  minBedrooms: 1,
  expiresAtMs: Date.now() + 10 * 24 * 60 * 60 * 1000,
  remainingApplications: 3,
  revoked: false,
  permittedActions: 1,
};

const BASE_LISTING: RentalListing = {
  id: "0xlisting",
  provider: "0xprovider",
  landlord: "0xlandlord",
  municipality: 1,
  monthlyRentEur: 1700,
  bedrooms: 2,
  active: true,
  expiresAtMs: Date.now() + 10 * 24 * 60 * 60 * 1000,
};

describe("evaluateEligibility", () => {
  it("approves a listing that meets all criteria", () => {
    const result = evaluateEligibility(BASE_MANDATE, BASE_LISTING);
    expect(result.eligible).toBe(true);
  });

  it("rejects revoked mandate", () => {
    const result = evaluateEligibility({ ...BASE_MANDATE, revoked: true }, BASE_LISTING);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/revoked/i);
  });

  it("rejects zero remaining applications", () => {
    const result = evaluateEligibility({ ...BASE_MANDATE, remainingApplications: 0 }, BASE_LISTING);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/allowance/i);
  });

  it("rejects expired mandate", () => {
    const result = evaluateEligibility({ ...BASE_MANDATE, expiresAtMs: Date.now() - 1000 }, BASE_LISTING);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("rejects expired listing", () => {
    const result = evaluateEligibility(BASE_MANDATE, { ...BASE_LISTING, expiresAtMs: Date.now() - 1000 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("rejects inactive listing", () => {
    const result = evaluateEligibility(BASE_MANDATE, { ...BASE_LISTING, active: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/active/i);
  });

  it("rejects disallowed municipality", () => {
    const result = evaluateEligibility(BASE_MANDATE, { ...BASE_LISTING, municipality: 6 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/municipality/i);
  });

  it("rejects rent above mandate maximum", () => {
    const result = evaluateEligibility(BASE_MANDATE, { ...BASE_LISTING, monthlyRentEur: 2500 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/exceeds/i);
  });

  it("rejects too few bedrooms", () => {
    const result = evaluateEligibility({ ...BASE_MANDATE, minBedrooms: 3 }, { ...BASE_LISTING, bedrooms: 2 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/bedroom/i);
  });

  it("rejects missing submit permission", () => {
    const result = evaluateEligibility({ ...BASE_MANDATE, permittedActions: 0 }, BASE_LISTING);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/permit/i);
  });
});
