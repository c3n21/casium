# @rentdelegate/e2e

Playwright end-to-end tests for the demo flows. Plan and tickets: `plan/backlog-e2e.md`.

## Run

```bash
pnpm test:e2e                 # from the repo root — the stubbed tier
pnpm --filter @rentdelegate/e2e e2e:stubbed
pnpm --filter @rentdelegate/e2e e2e:ui        # Playwright UI mode
```

The stubbed tier needs **no servers, no wallet, and no network**. Playwright builds and starts the web
app itself; the provider API (`:4021`) and agent service (`:4022`) are intercepted in the browser.

First run only: `pnpm exec playwright install chromium` if `~/.cache/ms-playwright/chromium-*` is missing.

## Tiers

| Project | State | Needs |
|---|---|---|
| `stubbed` | **implemented** | nothing |
| `live-services` | RD-148, not implemented | real provider-api + agent server, testnet reads |
| `wallet` | RD-143/RD-150, not implemented | the Slush session in `.playwright-wallet-profile/`, spends gas |

## Things that will bite you

- **The build is pinned and isolated.** `NEXT_PUBLIC_*` is inlined at build time, so `playwright.config.ts`
  pins `NEXT_PUBLIC_ENCRYPTION_MODE=mock` / `NEXT_PUBLIC_WALRUS_MODE=mock` on the build command.
  Otherwise a developer's `apps/web/.env.local` (which sets the live Seal + Walrus HTTP path) decides
  what the tests see. That build goes to `.next-e2e` via `NEXT_DIST_DIR`, so **running the tests never
  replaces the `.next` build you are about to demo**.
- **`reuseExistingServer` is off.** A server already on :3000 was probably started with different modes,
  and the mode badges are part of what these tests assert.
- **Fixtures are `auto`.** Playwright fixtures are lazy: a test that does not destructure `providerApi`
  would otherwise get no stub and make real requests to :4021, failing as `Failed to fetch` and looking
  like an app bug. Do not remove `{ auto: true }`.
- **CORS preflight.** The app posts JSON cross-origin to :4021, so the browser sends `OPTIONS` first.
  The stubs answer it. A stub that only handles `POST` will see every write fail before its handler runs.
- **Text matching is a case-insensitive substring by default.** See the audit below — this caused a real
  false pass.
- **Port 3000 is mandatory** once the `wallet` tier lands: the Slush session in the profile is bound to
  that origin. Do not fall back to another port.

## Selector Audit (RD-141)

Walked `/`, `/renter`, `/provider`, `/agent`, `/landlord` against the running app. **No `data-testid`
was needed** — every assertion in Phase 1 is reachable by role or text. RD-142's testid work is
therefore not required for these specs.

| Target | Selector that works | Note |
|---|---|---|
| Role dashboards | `getByRole("heading", { name: …, level: 1 })` | `"Renter Dashboard"`, `"Provider Dashboard"`, `"Agent Operator"`, `"Landlord — Access Panel"` |
| Listing rows | `getByRole("row", { name: /listing_lisbon_eligible/ })` | The table is semantic; row name includes every cell |
| Listing status | `toContainText("Active" \| "Ineligible")` scoped to the row | Colour alone is not asserted |
| Application card | `getByText("reserved" \| "accepted")` | Status badge text |
| Verify disclosure | `locator("summary", { hasText: "Verify Sui receipt" })` | `getByText` matches both `<details>` and `<summary>` → strict-mode violation |
| Verify inputs | `getByPlaceholder("tx digest")`, `getByPlaceholder("receipt object ID (0x...)")` | |
| Packet form | `getByLabel("Renter name (synthetic)")` etc. | Labels wrap their inputs |
| Encryption badge | `getByText("[MOCK encryption — AES-GCM, key in browser only]")` | Only correct because the build pins mock mode |
| Run section | `locator("section").filter({ has: getByRole("heading", { name }) })` | **Required** — the page renders two `RunSection`s with identical controls |
| Run result status | `getByText("Status: complete", { exact: true })` | **`exact: true` is required** — see below |

### The false pass worth remembering

`getByText("Status: complete")` passes on the `/agent` page **whether or not a run ever finished**: each
section's description reads *"Expect status: complete."*, and default text matching is a case-insensitive
substring. The first version of `agent-run.spec.ts` was green for the wrong reason. Always `exact: true`
on result status, and prefer asserting a negative (`toHaveCount(0)`) in a sibling test to prove the
positive assertion can actually fail.

## Layout

```
specs/                    one spec per flow
src/fixtures/
  test.ts                 extended `test` — auto-installs both stubs + console collector
  providerApi.ts          page.route stub for :4021, with a mutable store
  agentApi.ts             page.route stub for :4022, scripted run outcomes
  data.ts                 fixture payloads; Sui IDs imported from contracts-config
```

Never write a `0x…64-hex` literal in this package — `pnpm lint:object-ids` scans `*.ts` here (it only
excludes `*.test.ts`). Import from `@rentdelegate/contracts-config`, or build the string at runtime if
it is not a real object ID.
