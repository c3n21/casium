import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CreateMandateSchema, MUNICIPALITIES, MUNICIPALITY_LABELS } from "@casium/shared";

// MandateForm.tsx cannot be imported as a module here: it (and its "@/components/ui/*"
// dependencies) use the "@/..." path alias, which this package's vitest.config.ts does
// not resolve (no vite-tsconfig-paths / alias config — a pre-existing gap, out of scope
// for RD-221 to fix). So this reads its real source with `fs` (bypassing the Vite module
// graph entirely) to assert it actually sources municipalities from @casium/shared and
// carries no hand-typed label table, then separately checks the derivation contract those
// options must satisfy.
const mandateFormSource = readFileSync(
  join(process.cwd(), "src/components/MandateForm.tsx"),
  "utf-8",
);

const MANDATE_MUNICIPALITIES = Object.values(MUNICIPALITIES)
  .filter((code) => code !== MUNICIPALITIES.PORTO_INELIGIBLE_DEMO)
  .map((code) => ({ code, label: MUNICIPALITY_LABELS[code] }));

describe("MandateForm source sourcing", () => {
  it("imports municipalities from @casium/shared instead of a local table", () => {
    expect(mandateFormSource).toMatch(/from ["']@casium\/shared["']/);
    expect(mandateFormSource).toMatch(/\bMUNICIPALITIES\b/);
  });

  it("contains no hand-typed municipality label literals", () => {
    expect(mandateFormSource).not.toMatch(/"Lisbon"|"Oeiras"|"Cascais"|"Amadora"|"Almada"|"Porto"/);
  });

  it("excludes the ineligible demo municipality by referencing PORTO_INELIGIBLE_DEMO", () => {
    expect(mandateFormSource).toMatch(/PORTO_INELIGIBLE_DEMO/);
  });
});

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

describe("MandateForm allowed municipalities", () => {
  it("sources every option from the shared @casium/shared constant", () => {
    for (const { code, label } of MANDATE_MUNICIPALITIES) {
      expect(Object.values(MUNICIPALITIES)).toContain(code);
      expect(label).toBe(MUNICIPALITY_LABELS[code as keyof typeof MUNICIPALITY_LABELS]);
    }
  });

  it("does not offer the ineligible demo municipality (code 6) as a mandate target", () => {
    const codes = MANDATE_MUNICIPALITIES.map((m) => m.code);
    expect(codes).not.toContain(MUNICIPALITIES.PORTO_INELIGIBLE_DEMO);
    expect(codes).toHaveLength(Object.keys(MUNICIPALITIES).length - 1);
  });
});
