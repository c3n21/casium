# @casium/e2e

Playwright end-to-end tests for the demo flows. Plan and tickets: `plan/epics/E.md`.

## Run

```bash
pnpm test:e2e                 # from the repo root — the stubbed tier
pnpm test:e2e:live            # from the repo root — the live-services tier
pnpm --filter @casium/e2e e2e:stubbed
pnpm --filter @casium/e2e e2e:live
pnpm --filter @casium/e2e e2e:ui        # Playwright UI mode
```

The stubbed tier needs **no servers, no wallet, and no network**. Playwright builds and starts the web
app itself; the provider API (`:4021`) and agent service (`:4022`) are intercepted in the browser.

The live tier starts all three real processes itself and needs **network** (testnet gRPC), but still no
wallet, no docker, and no gas.

First run only: `pnpm exec playwright install chromium` if `~/.cache/ms-playwright/chromium-*` is missing.

## Tiers

| Project | State | Needs |
|---|---|---|
| `stubbed` | **implemented** | nothing |
| `live-services` | **implemented** (RD-148) | network; starts real provider-api + agent + web itself |
| `wallet` | RD-143/RD-150, not implemented | the Slush session in `.playwright-wallet-profile/`, spends gas |

## The live-services tier

`pnpm test:e2e:live` boots the real provider API, the real agent service and the web app, then drives
every demo flow against them. Nothing is intercepted: the browser talks to :4021 and :4022, and both
those services read testnet over gRPC.

| Spec | Flow |
|---|---|
| `services.spec.ts` | the three processes are up, wired together, and configured as the rest assumes |
| `provider-listing.spec.ts` | provider publishes listings; renter and provider dashboards read them back |
| `renter-packet.spec.ts` | mandate panel filled by a live chain read; encrypted packet registered listing-scoped |
| `agent-run.spec.ts` | the agent pipeline: AgentCap, mandate, eligibility, packet, reservation |
| `duplicate-human.spec.ts` | one World human, one application per listing; idempotency and replay |
| `mandate-binding.spec.ts` | `MANDATE_EVM_MISMATCH` / `MANDATE_SUI_MISMATCH` against real mandate objects |
| `receipt-verify.spec.ts` | provider accepts only after reading the real `ApplicationReceipt` off Sui |
| `landlord.spec.ts` | landlord panel rendered from live receipts; wallet gate and Seal fallback labeled |

### It cannot spend gas, by construction

The agent service is started with a **throwaway Ed25519 key**, regenerated per run and never funded.
`executeSubmitApplication` compares the key's address against `AGENT_SUI_ADDRESS` and throws *before*
building a transaction or selecting a gas coin. So an agent run exercises everything up to the signing
boundary — chain reads, eligibility, packet lookup, a real provider reservation that passes the
on-chain identity cross-check — and then stops there deterministically.

That shapes the specs: a run that reaches an **eligible** target throws out of the target loop, so its
per-target results are lost. Outcomes that complete the loop (ineligible, missing packet) are asserted
from the run result; the eligible path is asserted from what the provider recorded. Signing for real is
the wallet tier (RD-150), under the repo's live-spend gate.

`playwright.config.ts` also blanks `AGENTKIT_HEADER`, `AGENT_EVM_PRIVATE_KEY` and
`AGENT_SUI_PRIVATE_KEY_BASE64` explicitly — a value already in the environment beats
`--env-file-if-exists=../../.env`, but only a value that is *present* does, so each one has to be named.
A `liveServices` fixture then fails the run if the agent reports anything but `agentkitMode: mock`.

### Running beside a demo stack

`reuseExistingServer` is off, so the tier refuses to start if 3000/4021/4022 are busy — which they are
whenever `pnpm demo:up` is running. Move it rather than killing the demo:

```bash
E2E_WEB_PORT=3100 E2E_PROVIDER_PORT=4121 E2E_AGENT_PORT=4122 pnpm test:e2e:live
```

The **wallet** tier may never do this: its Slush session is bound to origin `http://localhost:3000`.

### Parallel safety

The provider runs `PROVIDER_STORE=memory`, so all specs share one mutable store, and two of its guards
are global for the life of the process: duplicate-human `(listing, human)` and idempotency
`(agent EVM, key)`. Every test therefore takes its own listing and its own World human from the
fixtures in `src/live/test.ts`. Two exceptions worth knowing:

- The transaction digest guard is global too, so only one test may successfully verify with
  `LIVE_AGENT_RUN.submitApplicationTxDigest`. That test sets `retries: 0` on its describe block —
  a second attempt would be rejected as a reused digest, which is correct behaviour and not flake.
- The agent service presents one fixed human (`AGENT_HUMAN_ID_HASH`), so only one spec may run the
  agent against an eligible listing per listing.

### AgentCap discovery is pinned, not discovered

`AGENT_CAP_ID` is set explicitly in the agent's env. It has to be: `findAgentCapForMandate` filters
owned objects by `${SUI_PACKAGE_ID}::rental::AgentCap`, and a Sui object's type keeps the package ID it
was **created** under. Every AgentCap on testnet predates the RD-133 upgrade, so discovery against
`LATEST_PACKAGE_ID` matches nothing and the run fails with `No AgentCap found for mandate …`.
`.env.example` pins `AGENT_CAP_ID` for the same reason.

## Things that will bite you

- **The build is pinned and isolated.** `NEXT_PUBLIC_*` is inlined at build time, so `playwright.config.ts`
  pins `NEXT_PUBLIC_ENCRYPTION_MODE=mock` / `NEXT_PUBLIC_WALRUS_MODE=mock` on the build command.
  Otherwise a developer's `apps/web/.env.local` (which sets the live Seal + Walrus HTTP path) decides
  what the tests see. That build goes to `.next-e2e` via `NEXT_DIST_DIR`, so **running the tests never
  replaces the `.next` build you are about to demo**.
- **`reuseExistingServer` is off.** A server already on :3000 was probably started with different modes,
  and the mode badges are part of what these tests assert. To run beside a demo stack, move the ports
  (see above) rather than reusing it.
- **Which servers start is decided by `E2E_TIER`.** A Playwright `webServer` list is global, not per
  project, so the stubbed tier would otherwise pay to boot two backends it immediately intercepts. The
  package scripts set it; `playwright test --project=live-services` on its own starts nothing, and the
  `liveServices` fixture says so instead of failing as a connection error.
- **Fixtures are `auto` in the stubbed tier.** Playwright fixtures are lazy: a test that does not
  destructure `providerApi` would otherwise get no stub and make real requests to :4021, failing as
  `Failed to fetch` and looking like an app bug. Do not remove `{ auto: true }`. The live tier is the
  mirror image — it installs no routes at all, and its `consoleErrors` fixture is deliberately *not*
  `auto` so the API-only specs never open a browser page.
- **CORS preflight.** The app posts JSON cross-origin to :4021, so the browser sends `OPTIONS` first.
  The stubs answer it. A stub that only handles `POST` will see every write fail before its handler runs.
- **Text matching is a case-insensitive substring by default.** See the audit below — this caused a real
  false pass.
- **Port 3000 is mandatory for the `wallet` tier**: the Slush session in the profile is bound to that
  origin. `E2E_WEB_PORT` exists for the two wallet-free tiers only — never point T3 anywhere else.

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
specs/                    stubbed tier — one spec per flow
specs/live/               live-services tier — one spec per flow
src/fixtures/             stubbed tier
  test.ts                 extended `test` — auto-installs both stubs + console collector
  providerApi.ts          page.route stub for :4021, with a mutable store
  agentApi.ts             page.route stub for :4022, scripted run outcomes
  data.ts                 fixture payloads; Sui IDs imported from contracts-config
src/live/                 live-services tier
  env.ts                  ports and identities shared with playwright.config.ts
  test.ts                 extended `test` — health preflight, per-test listing and human
  providerApi.ts          HTTP client for the real :4021
  agentApi.ts             HTTP client for the real :4022, with run polling
  chain.ts                read-only testnet gRPC helpers
  session.ts              localStorage handoff seeding (no wallet in this tier)
```

Never write a `0x…64-hex` literal in this package — `pnpm lint:object-ids` scans `*.ts` here (it only
excludes `*.test.ts`). Import from `@casium/contracts-config`, or build the string at runtime if
it is not a real object ID.
