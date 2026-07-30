/**
 * RD-214 screenshot harness.
 *
 * Captures full-page screenshots of the four flow entry points so a later
 * unit can diff the Tailwind + shadcn restyle against this baseline.
 * Animations are disabled per-call for deterministic output, and the output
 * directory is git-ignored (apps/e2e/screenshots/) since these are local
 * evidence artifacts, not fixtures. Deliberately NOT under test-results/:
 * Playwright wipes that directory at the start of every run, which would
 * destroy a "before" set the moment `pnpm test:e2e` runs again.
 *
 * The label comes from SHOT_LABEL so this same spec captures both the
 * "before" and "after" sets without being edited:
 *
 *   SHOT_LABEL=before pnpm --filter @casium/e2e e2e:shots
 *   SHOT_LABEL=after  pnpm --filter @casium/e2e e2e:shots
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "../src/fixtures/test.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LABEL = process.env.SHOT_LABEL ?? "unlabeled";
const OUT_DIR = path.join(__dirname, "..", "screenshots", LABEL);

// Each route's client component fetches/renders data-driven content after
// mount, so a bare `page.goto()` + screenshot races hydration and can catch
// the pre-content shell (verified: without this wait, /, /renter and
// /provider all captured byte-identical blank pages). Waiting on a
// route-distinguishing data-testid before every screenshot proves real
// content painted.
const ROUTES = [
  { path: "/", file: "index", waitFor: "core-message" },
  // /renter shows the listing checkboxes only after a mandate exists
  // (localStorage or URL); with neither seeded here, the default render is
  // the "no mandate yet" state, so wait on the unconditionally-rendered
  // evidence panel instead of a data-testid that only appears post-mandate.
  { path: "/renter", file: "renter", waitFor: "developer-evidence" },
  { path: "/provider", file: "provider", waitFor: "listing-row-listing_lisbon_eligible" },
  { path: "/landlord", file: "landlord", waitFor: "landlord-page-title" },
] as const;

for (const { path: route, file, waitFor } of ROUTES) {
  test(`screenshot ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.getByTestId(waitFor).waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(OUT_DIR, `${file}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}
