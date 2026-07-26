import type { Page } from "@playwright/test";
import { LIVE_AGENT_RUN } from "@rentdelegate/contracts-config";
import type { ProviderListing } from "./data.js";

export async function seedMandateSession(page: Page) {
  await page.addInitScript(
    ({ mandateId, ownerCapId, agentCapId, txDigest }) => {
      localStorage.setItem("rentdelegate:lastMandateId", mandateId);
      localStorage.setItem("rentdelegate:lastOwnerCapId", ownerCapId);
      localStorage.setItem("rentdelegate:lastAgentCapId", agentCapId);
      localStorage.setItem("rentdelegate:lastMandateTxDigest", txDigest);
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
    localStorage.setItem("rentdelegate:lastSelectedListings", JSON.stringify(storedListings));
  }, listings.map((listing) => ({
    providerListingId: listing.id,
    listingObjectId: listing.listingObjectId,
  })));
}
