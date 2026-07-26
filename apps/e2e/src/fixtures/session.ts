import type { Page } from "@playwright/test";
import { LIVE_AGENT_RUN } from "@casium/contracts-config";
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
      mandateId: LIVE_AGENT_RUN.mandateId,
      ownerCapId: LIVE_AGENT_RUN.ownerCapId,
      agentCapId: LIVE_AGENT_RUN.agentCapId,
      txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
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
