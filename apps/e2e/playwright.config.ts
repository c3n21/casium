import { defineConfig, devices } from "@playwright/test";

/**
 * RentDelegate E2E configuration (Epic E, RD-141).
 *
 * Three tiers, see plan/backlog-e2e.md:
 *   stubbed        no servers, no chain — provider/agent APIs intercepted by page.route
 *   live-services  real provider-api + agent server, read-only testnet gRPC
 *   wallet         persistent Slush profile, spends gas — deferred (RD-143/RD-150)
 *
 * Port 3000 is mandatory, not conventional: the Slush session in
 * .playwright-wallet-profile/ is bound to origin http://localhost:3000. Never
 * fall back to another port.
 */

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// The stubbed tier needs the app built with mock modes. Two things matter here:
//
//  1. NEXT_PUBLIC_* is inlined at build time, so the modes must be pinned on the
//     build command — otherwise a developer's apps/web/.env.local (which sets
//     the live Seal + Walrus HTTP path) decides what the tests see.
//  2. NEXT_DIST_DIR keeps that build out of `.next`, so running the tests never
//     replaces the build the developer is about to demo.
const webServerCommand = process.env.E2E_WEB_DEV
  ? "pnpm --filter @rentdelegate/web dev"
  : "pnpm --filter @rentdelegate/web build && pnpm --filter @rentdelegate/web start";

const webServerEnv = {
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_ENCRYPTION_MODE: "mock",
  NEXT_PUBLIC_WALRUS_MODE: "mock",
  NEXT_PUBLIC_PROVIDER_API_URL: "http://localhost:4021",
  NEXT_PUBLIC_AGENT_API_URL: "http://localhost:4022",
};

export default defineConfig({
  testDir: "specs",
  globalTeardown: "./src/restoreNextEnv.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "stubbed",
      testMatch: /(navigation|provider-dashboard|renter-packet|agent-run)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // RD-148. Requires the real provider-api and agent server; add their
      // webServer entries with that ticket.
      name: "live-services",
      testMatch: /(live-services|landlord-receipt)\.spec\.ts/,
      retries: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    // RD-143/RD-150 add the `wallet` project here: persistent context on
    // .playwright-wallet-profile, workers: 1, trace/video off.
  ],

  webServer: {
    command: webServerCommand,
    url: BASE_URL,
    env: webServerEnv,
    // Off by design: a server already on :3000 was almost certainly started with
    // different NEXT_PUBLIC_* modes, and the mode badges are part of what these
    // tests assert. Reusing it would make results depend on how it was started.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
