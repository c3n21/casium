/**
 * Extended Playwright `test` for the stubbed tier.
 *
 * Fixtures are installed before navigation, so a spec can simply `page.goto()`.
 * Both stubs are always installed: a page that never calls one costs nothing,
 * and a page that unexpectedly calls the *other* API fails loudly with a 404
 * rather than hanging on a real connection attempt.
 */

import { test as base, expect } from "@playwright/test";
import { installAgentApiStub, type AgentApiStub } from "./agentApi.js";
import { installProviderApiStub, type ProviderApiStub } from "./providerApi.js";

type Fixtures = {
  providerApi: ProviderApiStub;
  agentApi: AgentApiStub;
  /** Console errors collected during the test. Message strings only — never dumps. */
  consoleErrors: string[];
};

// All three are `auto` on purpose. Playwright fixtures are lazy: without it, a
// test that does not destructure `providerApi` gets no stub and silently makes
// real requests to :4021/:4022, which fail as "Failed to fetch" and look like
// an app bug. Auto-install keeps the tier hermetic no matter what a spec asks
// for.
export const test = base.extend<Fixtures>({
  providerApi: [
    async ({ page }, use) => {
      const stub = await installProviderApiStub(page);
      await use(stub);
    },
    { auto: true },
  ],

  agentApi: [
    async ({ page }, use) => {
      const stub = await installAgentApiStub(page);
      await use(stub);
    },
    { auto: true },
  ],

  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };
