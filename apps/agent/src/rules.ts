import type { RentalMandate, RentalListing } from "@rentdelegate/sui-client";

export type EligibilityResult =
  | { eligible: true; reason: string }
  | { eligible: false; reason: string };

/**
 * Deterministic rules engine. Evaluates a listing against a mandate.
 * No LLM involved — all logic is explicit and auditable.
 */
export function evaluateEligibility(mandate: RentalMandate, listing: RentalListing): EligibilityResult {
  if (mandate.revoked) {
    return { eligible: false, reason: "Mandate has been revoked." };
  }

  if (mandate.remainingApplications <= 0) {
    return { eligible: false, reason: "Mandate has no remaining application allowance." };
  }

  const nowMs = Date.now();
  if (mandate.expiresAtMs < nowMs) {
    return { eligible: false, reason: `Mandate expired at ${new Date(mandate.expiresAtMs).toISOString()}.` };
  }

  if (listing.expiresAtMs < nowMs) {
    return { eligible: false, reason: `Listing expired at ${new Date(listing.expiresAtMs).toISOString()}.` };
  }

  if (!listing.active) {
    return { eligible: false, reason: "Listing is not active." };
  }

  if (!mandate.allowedMunicipalities.includes(listing.municipality)) {
    return {
      eligible: false,
      reason: `Listing municipality ${listing.municipality} is not in mandate's allowed list [${mandate.allowedMunicipalities.join(", ")}].`,
    };
  }

  if (listing.monthlyRentEur > mandate.maxMonthlyRentEur) {
    return {
      eligible: false,
      reason: `Listing rent €${listing.monthlyRentEur} exceeds mandate maximum €${mandate.maxMonthlyRentEur}.`,
    };
  }

  if (listing.bedrooms < mandate.minBedrooms) {
    return {
      eligible: false,
      reason: `Listing has ${listing.bedrooms} bedroom(s), mandate requires at least ${mandate.minBedrooms}.`,
    };
  }

  // ACTION_SUBMIT_DOCS = 1
  const canSubmit = (mandate.permittedActions & 1) !== 0;
  if (!canSubmit) {
    return { eligible: false, reason: "Mandate does not permit ACTION_SUBMIT_DOCS." };
  }

  return {
    eligible: true,
    reason: `Listing meets all mandate criteria: municipality ${listing.municipality}, rent €${listing.monthlyRentEur}, ${listing.bedrooms} bedrooms.`,
  };
}
