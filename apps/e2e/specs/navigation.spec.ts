/**
 * RD-145 — Flow F1: the landing page and the three role dashboards.
 * First thing shown on stage; a broken route here ends the demo immediately.
 */

import { expect, test } from "../src/fixtures/test.js";

test("landing page shows the product message and three role links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Casium" })).toBeVisible();
  await expect(
    page.getByText("World limits who the agent represents. Sui limits what the agent can do."),
  ).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(3);
});

const ROUTES = [
  { link: /^Renter —/, heading: "Renter Dashboard" },
  { link: /^Provider —/, heading: "Provider Dashboard" },
  { link: /^Landlord —/, heading: "Landlord — Access Panel" },
] as const;

for (const { link, heading } of ROUTES) {
  test(`navigates to ${heading}`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  });
}

test("the agent operator page is reachable directly", async ({ page }) => {
  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "Agent Operator", level: 1 })).toBeVisible();
});
