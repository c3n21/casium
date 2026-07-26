/**
 * The tier's own preflight: the three real processes are up, wired to each
 * other, and configured the way every other live spec assumes.
 *
 * If this file fails, the rest of the tier is noise — read it first.
 */

import { LATEST_PACKAGE_ID, PUBLISHER_ADDRESS } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { AGENT_EVM_ADDRESS, AGENT_API_URL, PROVIDER_API_URL } from "../../src/live/env.js";
import { agentHealth, agentIdentity } from "../../src/live/agentApi.js";

test("the provider API is live and holding state in memory", async ({ request }) => {
  const response = await request.get(`${PROVIDER_API_URL}/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true,
    service: "provider-api",
    store: "memory",
  });
});

test("the agent service reports its real identity and mock AgentKit mode", async ({ request }) => {
  const health = await agentHealth(request);

  expect(health).toMatchObject({
    ok: true,
    service: "casium-agent",
    agentSuiAddress: PUBLISHER_ADDRESS,
    agentkitMode: "mock",
  });
  // Case is not normalized on the way out, and the provider compares
  // case-insensitively, so neither should this.
  expect(health.agentEvmAddress?.toLowerCase()).toBe(AGENT_EVM_ADDRESS.toLowerCase());
});

test("the agent targets the deployed testnet package", async ({ request }) => {
  const identity = await agentIdentity(request);

  expect(identity.packageId).toBe(LATEST_PACKAGE_ID);
});

test("the web app reaches both real services from the browser", async ({ page }) => {
  // Whether the browser can actually talk to :4022 — the stubbed tier can only
  // prove the app renders whatever a route handler returned.
  const health = page.waitForResponse(`${AGENT_API_URL}/health`);
  await page.goto("/agent");
  expect((await health).status()).toBe(200);

  await expect(page.getByText("Agent online")).toBeVisible();
  await expect(page.getByText("agentkit: mock")).toBeVisible();
  await expect(page.getByText(PUBLISHER_ADDRESS.slice(0, 16))).toBeVisible();
});
