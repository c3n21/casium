import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { ACTIVE_AGENT_MANDATE, LATEST_PACKAGE_ID, PUBLISHER_ADDRESS, RPC_URL } from "@casium/contracts-config";
import {
  AGENT_ACCESS_WINDOW_DAYS,
  AGENT_API_PORT,
  AGENT_API_URL,
  AGENT_EVM_ADDRESS,
  AGENT_HUMAN_ID_HASH,
  PROVIDER_API_PORT,
  PROVIDER_API_URL,
  WEB_PORT,
  WEB_URL,
} from "./src/live/env.js";

/**
 * Casium E2E configuration (Epic E, RD-141 + RD-148).
 *
 * Three tiers, see plan/backlog-e2e.md:
 *   stubbed        no servers, no chain — provider/agent APIs intercepted by page.route
 *   live-services  real provider-api + agent server, read-only testnet gRPC
 *   wallet         persistent Slush profile, spends gas — deferred (RD-143/RD-150)
 *
 * Port 3000 is mandatory, not conventional: the Slush session in
 * .playwright-wallet-profile/ is bound to origin http://localhost:3000. Never
 * fall back to another port.
 *
 * Which servers start is decided by E2E_TIER, set by the package scripts. A
 * Playwright `webServer` list is global, not per project, so the stubbed tier
 * would otherwise pay to boot two backends it immediately intercepts.
 */

const LIVE = process.env.E2E_TIER === "live";

// The stubbed tier needs the app built with mock modes. Two things matter here:
//
//  1. NEXT_PUBLIC_* is inlined at build time, so the modes must be pinned on the
//     build command — otherwise a developer's apps/web/.env.local (which sets
//     the live Seal + Walrus HTTP path) decides what the tests see.
//  2. NEXT_DIST_DIR keeps that build out of `.next`, so running the tests never
//     replaces the build the developer is about to demo.
const webServerCommand = process.env.E2E_WEB_DEV
  ? "pnpm --filter @casium/web dev"
  : "pnpm --filter @casium/web build && pnpm --filter @casium/web start";

const stubbedWebEnv = {
  PORT: String(WEB_PORT),
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_ENCRYPTION_MODE: "mock",
  NEXT_PUBLIC_WALRUS_MODE: "mock",
  NEXT_PUBLIC_E2E_STUB_SUI: "1",
  NEXT_PUBLIC_PROVIDER_API_URL: PROVIDER_API_URL,
  NEXT_PUBLIC_AGENT_API_URL: AGENT_API_URL,
};

// The live tier deliberately drops NEXT_PUBLIC_E2E_STUB_SUI: the /agent page's
// MANDATE_EVM_MISMATCH preflight must read the mandate from testnet for real,
// which is half of what this tier exists to prove. Its own dist dir keeps that
// build separate from the stubbed one, so switching tiers never silently reuses
// a bundle compiled with the opposite flags.
const liveWebEnv = {
  PORT: String(WEB_PORT),
  NEXT_DIST_DIR: ".next-e2e-live",
  NEXT_PUBLIC_ENCRYPTION_MODE: "mock",
  NEXT_PUBLIC_WALRUS_MODE: "mock",
  NEXT_PUBLIC_PROVIDER_API_URL: PROVIDER_API_URL,
  NEXT_PUBLIC_AGENT_API_URL: AGENT_API_URL,
};

/**
 * A throwaway Ed25519 secret, regenerated every run and never funded.
 *
 * This is the gas gate. `executeSubmitApplication` compares the address this
 * key derives against AGENT_SUI_ADDRESS and throws **before** it builds a
 * transaction, selects a gas coin, or contacts the network. So an agent run in
 * this tier exercises the entire pipeline — AgentCap discovery, mandate load,
 * eligibility, packet lookup, provider reservation — and then stops at the
 * signing boundary with a deterministic error. No transaction is signed and no
 * gas is spent, by construction rather than by hoping.
 *
 * Signing genuinely belongs to the wallet tier (RD-150), which is under the
 * repo's live-spend gate.
 */
const THROWAWAY_AGENT_SUI_KEY = randomBytes(32).toString("base64");

// Explicit empty strings, not omissions. Both services start through
// `node --env-file-if-exists=../../.env`, and while a value already present in
// the environment wins over the file, only a value that is *present* wins —
// so every credential the file might carry has to be named and blanked here.
const NO_LIVE_CREDENTIALS = {
  AGENTKIT_HEADER: "",
  AGENT_EVM_PRIVATE_KEY: "",
  AGENT_SUI_PRIVATE_KEY_BASE64: "",
};

const providerApiServer = {
  command: "pnpm --filter @casium/provider-api build && pnpm --filter @casium/provider-api start",
  url: `${PROVIDER_API_URL}/health`,
  env: {
    ...NO_LIVE_CREDENTIALS,
    PORT: String(PROVIDER_API_PORT),
    // memory, not postgres: the tier must run without docker. The cost is that
    // the duplicate-human and idempotency guards are shared across the whole
    // session — see the fixtures in src/live/test.ts.
    PROVIDER_STORE: "memory",
    AGENTKIT_MODE: "mock",
    WALRUS_MODE: "mock",
    SUI_RPC_URL: RPC_URL,
    SUI_PACKAGE_ID: LATEST_PACKAGE_ID,
  },
  reuseExistingServer: false,
  timeout: 120_000,
  stdout: "ignore" as const,
  stderr: "pipe" as const,
};

const agentServer = {
  command: "pnpm --filter @casium/agent build && pnpm --filter @casium/agent start:server",
  url: `${AGENT_API_URL}/health`,
  env: {
    ...NO_LIVE_CREDENTIALS,
    AGENT_SERVER_PORT: String(AGENT_API_PORT),
    PROVIDER_API_URL,
    SUI_RPC_URL: RPC_URL,
    SUI_PACKAGE_ID: LATEST_PACKAGE_ID,
    // The mandate whose on-chain agent_evm matches AGENT_EVM_ADDRESS and whose
    // agent_sui is the publisher. Any other mandate fails the provider's
    // on-chain identity cross-check — which mandate-binding.spec.ts asserts.
    MANDATE_ID: ACTIVE_AGENT_MANDATE.mandateId,
    AGENT_SUI_ADDRESS: PUBLISHER_ADDRESS,
    AGENT_EVM_ADDRESS,
    // Pinned, not discovered — and it has to be. `findAgentCapForMandate`
    // filters owned objects by `${SUI_PACKAGE_ID}::rental::AgentCap`, but a Sui
    // object's type keeps the package ID it was *created* under. Every AgentCap
    // on testnet predates the RD-133 upgrade, so discovery against
    // LATEST_PACKAGE_ID matches nothing and the run dies with "No AgentCap
    // found for mandate …". `.env.example` sets AGENT_CAP_ID for exactly this
    // reason; the tier mirrors that rather than papering over it.
    AGENT_CAP_ID: ACTIVE_AGENT_MANDATE.agentCapId,
    AGENT_SUI_PRIVATE_KEY: THROWAWAY_AGENT_SUI_KEY,
    AGENT_ACCESS_WINDOW_DAYS: String(AGENT_ACCESS_WINDOW_DAYS),
    // Mock AgentKit. Proves nothing about World identity and is labeled as such
    // by the agent itself; the live World path needs a signed header a test
    // cannot mint.
    AGENTKIT_MODE: "mock",
    AGENTKIT_DEMO_HUMAN_ID_HASH: AGENT_HUMAN_ID_HASH,
    AGENTKIT_DEMO_AGENT_EVM_ADDRESS: AGENT_EVM_ADDRESS,
  },
  reuseExistingServer: false,
  timeout: 120_000,
  stdout: "ignore" as const,
  stderr: "pipe" as const,
};

const webServer = {
  command: webServerCommand,
  url: WEB_URL,
  env: LIVE ? liveWebEnv : stubbedWebEnv,
  // Off by design: a server already on :3000 was almost certainly started with
  // different NEXT_PUBLIC_* modes, and the mode badges are part of what these
  // tests assert. Reusing it would make results depend on how it was started.
  reuseExistingServer: false,
  timeout: 240_000,
  stdout: "ignore" as const,
  stderr: "pipe" as const,
};

export default defineConfig({
  testDir: "specs",
  globalTeardown: "./src/restoreNextEnv.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: LIVE ? 120_000 : 60_000,
  expect: { timeout: LIVE ? 20_000 : 10_000 },

  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "stubbed",
      testMatch: /(navigation|provider-dashboard|renter-packet|agent-run)\.spec\.ts/,
      // Required: the live specs reuse those flow names under specs/live/, and
      // testMatch is applied to the whole path.
      testIgnore: /live\//,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // RD-148. Started by `pnpm --filter @casium/e2e e2e:live`, which sets
      // E2E_TIER=live so the backends above actually boot.
      name: "live-services",
      testMatch: /live\/.*\.spec\.ts/,
      // Public testnet RPC is the flaky dependency; the retry is explicit
      // rather than pretended away. Specs whose provider-side effects cannot be
      // replayed opt out per describe block.
      retries: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    // RD-143/RD-150 add the `wallet` project here: persistent context on
    // .playwright-wallet-profile, workers: 1, trace/video off.
  ],

  webServer: LIVE ? [providerApiServer, agentServer, webServer] : webServer,
});
