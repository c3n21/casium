/**
 * RD-145 — Flow F1: the landing page and the three role dashboards.
 * First thing shown on stage; a broken route here ends the demo immediately.
 */

import { expect, test } from "../src/fixtures/test.js";

test("landing page shows the product message and role entry points", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Apply without handing over the keys." })).toBeVisible();
  await expect(
    page.getByTestId("core-message"),
  ).toBeVisible();
  await expect(page.getByTestId("role-renter-link")).toBeVisible();
  await expect(page.getByTestId("role-provider-card")).toBeVisible();
  await expect(page.getByTestId("role-landlord-card")).toBeVisible();
});

const ROUTES = [
  { testId: "nav-renter", heading: "Set limits. Keep custody." },
  { testId: "nav-provider", heading: "Provider Dashboard" },
  { testId: "nav-landlord", heading: "Landlord Access Panel" },
] as const;

for (const { testId, heading } of ROUTES) {
  test(`navigates to ${heading}`, async ({ page }) => {
    await page.goto("/");
    await page.getByTestId(testId).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  });
}

test("the agent operator page is reachable directly", async ({ page }) => {
  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "Agent Run", level: 1 })).toBeVisible();
});
