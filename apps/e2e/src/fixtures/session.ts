import type { Page } from "@playwright/test";
import { ACTIVE_AGENT_MANDATE } from "@casium/contracts-config";
import type { ProviderListing } from "./data.js";

export async function seedMandateSession(page: Page) {
  await page.addInitScript(
    ({ mandateId, ownerCapId, agentCapId, txDigest }) => {
      localStorage.setItem("casium:lastMandateId", mandateId);
      localStorage.setItem("casium:lastOwnerCapId", ownerCapId);
      localStorage.setItem("casium:lastAgentCapId", agentCapId);
      localStorage.setItem("casium:lastMandateTxDigest", txDigest);
    },
    {
      mandateId: ACTIVE_AGENT_MANDATE.mandateId,
      ownerCapId: ACTIVE_AGENT_MANDATE.ownerCapId,
      agentCapId: ACTIVE_AGENT_MANDATE.agentCapId,
      txDigest: ACTIVE_AGENT_MANDATE.createMandateTxDigest,
    },
  );
}

export async function seedSelectedListings(page: Page, listings: ProviderListing[]) {
  await page.addInitScript((storedListings) => {
    localStorage.setItem("casium:lastSelectedListings", JSON.stringify(storedListings));
  }, listings.map((listing) => ({
    providerListingId: listing.id,
    listingObjectId: listing.listingObjectId,
    externalListingId: listing.externalListingId,
  })));
}
