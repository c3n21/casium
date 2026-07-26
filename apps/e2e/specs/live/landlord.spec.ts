/**
 * Flow 6 — the landlord panel, filled entirely by live testnet reads.
 *
 * Step 9 of `docs/demo-script.md`. The receipt tables here are not fixtures:
 * the browser fetches both `ApplicationReceipt` objects over gRPC and renders
 * their real fields, so this spec fails if a receipt is withdrawn on chain, if
 * the parser drifts, or if the endpoint is unreachable — and it must fail
 * loudly in that last case rather than soft-pass.
 *
 * Two things belong to other tiers and are asserted only in their absent state:
 *   - the wallet-connected landlord inbox (wallet tier, RD-150);
 *   - Seal decryption, which needs `ctx.sender() == receipt.landlord` and a
 *     signed SessionKey (RD-151). This tier is pinned to mock encryption, so
 *     the panel is expected to show its fallback banner.
 */

import { LIVE_AGENT_RUN, SMOKE } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { readReceipt } from "../../src/live/chain.js";

test("the landlord inbox is wallet-gated", async ({ page }) => {
  await page.goto("/landlord");

  await expect(page.getByRole("heading", { name: "Landlord — Access Panel", level: 1 })).toBeVisible();
  await expect(
    page.getByText("Connect your wallet to see applications for your listings."),
  ).toBeVisible();
});

test("both demo receipts render live from testnet", async ({ page }) => {
  const [smoke, live] = await Promise.all([
    readReceipt(SMOKE.receiptId),
    readReceipt(LIVE_AGENT_RUN.receiptId),
  ]);

  await page.goto("/landlord");
  await page.locator("summary", { hasText: "Demo evidence (known testnet receipts)" }).click();

  const smokePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Smoke receipt (testnet)" }),
  });
  const livePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^Live agent receipt/ }),
  });

  for (const [panel, receipt] of [
    [smokePanel, smoke],
    [livePanel, live],
  ] as const) {
    // Status 1 is STATUS_SUBMITTED. A withdrawn receipt would read "Withdrawn"
    // and Seal would refuse the packet — the same bit gates both.
    expect(receipt.status).toBe(1);
    await expect(panel.getByText("✅ Submitted")).toBeVisible();
    // `.first()` throughout: the agent and provider are the same address on
    // these demo objects, and the access expiry is repeated by the packet
    // panel below the table. Both would otherwise be strict-mode violations.
    await expect(panel.getByText(receipt.agent, { exact: true }).first()).toBeVisible();
    await expect(
      panel.getByText(new Date(receipt.submittedAtMs).toISOString(), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(new Date(receipt.accessExpiresAtMs).toISOString(), { exact: true }).first(),
    ).toBeVisible();
    // Both demo packets were stored through the labeled mock adapter. The badge
    // is the honesty check: a `mock:` blob must never read as "Live Walrus".
    await expect(panel.getByText("Mock (labeled)")).toBeVisible();
  }
});

test("the packet panel labels the mock blob and the missing Seal path", async ({ page }) => {
  await page.goto("/landlord");
  await page.locator("summary", { hasText: "Demo evidence (known testnet receipts)" }).click();

  const livePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^Live agent receipt/ }),
  });

  await expect(livePanel.getByText("Encrypted application packet")).toBeVisible();
  await expect(livePanel.getByText("Mock blob — no real storage")).toBeVisible();
  // NEXT_PUBLIC_ENCRYPTION_MODE is pinned to mock for this tier, so the panel
  // must say so rather than offering a Seal flow it cannot complete.
  await expect(livePanel.getByRole("alert")).toContainText("Seal fallback mode");
  await expect(
    livePanel.getByRole("button", { name: "Request access (sign session key)" }),
  ).toHaveCount(0);

  // The on-chain access window is what `seal_approve_packet` enforces; the
  // panel must show the real value, not a placeholder.
  const receipt = await readReceipt(LIVE_AGENT_RUN.receiptId);
  await expect(
    livePanel.getByText(new Date(receipt.accessExpiresAtMs).toISOString(), { exact: true }).last(),
  ).toBeVisible();
});
