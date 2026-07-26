/**
 * localStorage seeding for the live tier.
 *
 * The renter and agent dashboards hand off through `casium:*` keys written by
 * a wallet-signed `create_mandate`. This tier has no wallet, so it seeds the
 * handoff with the real testnet mandate whose on-chain `agent_evm` matches the
 * running agent service — the same object the agent will load over gRPC a
 * moment later. Nothing here fakes chain state; it only replays the pointer a
 * previous demo run would have stored.
 */

import type { Page } from "@playwright/test";
import { LIVE_AGENT_RUN } from "@casium/contracts-config";

export type SeedListing = {
  providerListingId: string;
  listingObjectId: string;
  externalListingId: string;
};

/** The mandate every live spec drives: real, unrevoked, bound to this agent. */
export const LIVE_MANDATE_ID = LIVE_AGENT_RUN.mandateId;

export async function seedMandate(page: Page, mandateId: string = LIVE_MANDATE_ID) {
  await page.addInitScript(
    ({ mandateId: id, ownerCapId, agentCapId, txDigest }) => {
      localStorage.setItem("casium:lastMandateId", id);
      localStorage.setItem("casium:lastOwnerCapId", ownerCapId);
      localStorage.setItem("casium:lastAgentCapId", agentCapId);
      localStorage.setItem("casium:lastMandateTxDigest", txDigest);
    },
    {
      mandateId,
      ownerCapId: LIVE_AGENT_RUN.ownerCapId,
      agentCapId: LIVE_AGENT_RUN.agentCapId,
      txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
    },
  );
}

export async function seedTargets(page: Page, targets: SeedListing[]) {
  await page.addInitScript((stored) => {
    localStorage.setItem("casium:lastSelectedListings", JSON.stringify(stored));
  }, targets);
}
