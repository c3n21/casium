/**
 * Extended Playwright `test` for the live-services tier (T2).
 *
 * Opposite of the stubbed tier: nothing is intercepted. `page.route` is never
 * installed, so every request the browser makes goes to the real provider API,
 * the real agent service, and real testnet gRPC.
 *
 * What the fixtures buy is **parallel safety**. The provider runs with
 * `PROVIDER_STORE=memory`, so all tests share one mutable store for the life of
 * the process, and two of its guards are global:
 *
 *   - duplicate human — keyed on (listing, human)
 *   - idempotency     — keyed on (agent EVM, idempotency key)
 *
 * So each test gets its own listing and its own World human. Sharing either
 * would make one test's success depend on whether another ran first.
 */

import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { AGENT_EVM_ADDRESS, AGENT_API_URL, PROVIDER_API_URL } from "./env.js";
import { agentHealth } from "./agentApi.js";
import { createListing, type LiveHuman, type ProviderListing } from "./providerApi.js";

type Fixtures = {
  /** Fails fast, with the command to fix it, when the tier was started wrong. */
  liveServices: void;
  /** A World identity unique to this test. */
  human: LiveHuman;
  /** A provider listing unique to this test, bound to the eligible Lisbon object. */
  listing: ProviderListing;
  /**
   * Console errors collected during the test. Message strings only.
   * Not `auto`, unlike the stubbed tier: forcing it would open a browser page
   * for the API-only specs, which never navigate.
   */
  consoleErrors: string[];
};

async function assertReachable(request: APIRequestContext, url: string, name: string) {
  let response;
  try {
    response = await request.get(`${url}/health`);
  } catch (error) {
    throw new Error(
      `The ${name} is not reachable at ${url}. The live tier starts it for you — ` +
        `run \`pnpm --filter @casium/e2e e2e:live\` (or \`pnpm test:e2e:live\` from the root), ` +
        `not \`playwright test --project=live-services\` directly. Cause: ${String(error)}`,
    );
  }
  if (!response.ok()) {
    throw new Error(`The ${name} answered ${response.status()} on ${url}/health.`);
  }
}

export const test = base.extend<Fixtures>({
  liveServices: [
    async ({ request }, use) => {
      await assertReachable(request, PROVIDER_API_URL, "provider API");
      await assertReachable(request, AGENT_API_URL, "agent service");

      // The whole tier is gas-free because the agent presents mock AgentKit
      // credentials and holds a throwaway Sui key (playwright.config.ts). If a
      // developer's .env leaked live signing into this run, fail here rather
      // than discover it from a testnet transaction.
      const health = await agentHealth(request);
      if (health.agentkitMode !== "mock") {
        throw new Error(
          `The live tier requires the agent in mock AgentKit mode, got "${health.agentkitMode}". ` +
            `A real AGENTKIT_HEADER or AGENT_EVM_PRIVATE_KEY is leaking into the test process.`,
        );
      }

      await use();
    },
    { auto: true },
  ],

  human: async ({}, use) => {
    const humanIdHash = `sha256:e2e-${crypto.randomUUID()}`;
    await use({
      humanIdHash,
      agentEvmAddress: AGENT_EVM_ADDRESS,
      headers: {
        "x-demo-human-id-hash": humanIdHash,
        "x-demo-agent-evm-address": AGENT_EVM_ADDRESS,
      },
    });
  },

  listing: async ({ request }, use) => {
    await use(await createListing(request));
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await use(errors);
  },
});

export { expect };
