import { describe, expect, it } from "vitest";
import { CreateMandateSchema } from "@casium/shared";

describe("MandateForm validation", () => {
  it("rejects empty agent addresses", () => {
    const result = CreateMandateSchema.safeParse({
      agentSuiAddress: "",
      agentEvmAddress: "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe",
      maxMonthlyRentEur: 2000,
      allowedMunicipalities: [1],
      minBedrooms: 1,
      expiresAtMs: Date.now() + 86400000,
      remainingApplications: 3,
      permittedActions: 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid mandate input", () => {
    const result = CreateMandateSchema.safeParse({
      agentSuiAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agentEvmAddress: "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe",
      maxMonthlyRentEur: 2000,
      allowedMunicipalities: [1, 2],
      minBedrooms: 1,
      expiresAtMs: Date.now() + 86400000,
      remainingApplications: 3,
      permittedActions: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero remaining applications", () => {
    const result = CreateMandateSchema.safeParse({
      agentSuiAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agentEvmAddress: "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe",
      maxMonthlyRentEur: 2000,
      allowedMunicipalities: [1],
      minBedrooms: 1,
      expiresAtMs: Date.now() + 86400000,
      remainingApplications: 0,
      permittedActions: 1,
    });
    expect(result.success).toBe(false);
  });
});
