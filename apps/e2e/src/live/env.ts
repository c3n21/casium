/**
 * Constants shared by `playwright.config.ts` (which starts the live services)
 * and the specs that talk to them. Keeping them in one module is what stops the
 * config and the assertions from drifting apart.
 *
 * No Sui object ID belongs here — import those from `@casium/contracts-config`.
 */

/**
 * Ports. The defaults are the demo's, and the wallet tier (T3) may never move
 * off 3000 — the Slush session in `.playwright-wallet-profile/` is bound to
 * that origin. T2 has no wallet, so the overrides exist for one situation: a
 * `pnpm demo:up` stack is already holding these ports and should keep them.
 * The live tier starts its own servers (`reuseExistingServer: false`) and would
 * otherwise refuse to start at all.
 *
 *   E2E_WEB_PORT=3100 E2E_PROVIDER_PORT=4121 E2E_AGENT_PORT=4122 pnpm test:e2e:live
 */
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
export const PROVIDER_API_PORT = Number(process.env.E2E_PROVIDER_PORT ?? 4021);
export const AGENT_API_PORT = Number(process.env.E2E_AGENT_PORT ?? 4022);

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const PROVIDER_API_URL = `http://localhost:${PROVIDER_API_PORT}`;
export const AGENT_API_URL = `http://localhost:${AGENT_API_PORT}`;

/**
 * The EVM address recorded on chain as `agent_evm` of `ACTIVE_AGENT_MANDATE.mandateId`.
 *
 * The live agent service presents exactly this address, so the provider's
 * on-chain identity cross-check (`applications.ts` → reserve) passes. Point the
 * agent at a mandate carrying any other `agent_evm` — `SMOKE.mandateId` carries
 * `0x313131` — and the same check fails with `MANDATE_EVM_MISMATCH`, which is
 * what `mandate-binding.spec.ts` asserts.
 *
 * Not an object ID: 40 hex characters, so `pnpm lint:object-ids` ignores it.
 */
export const AGENT_EVM_ADDRESS = "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe";

/**
 * The World human the live agent service presents through mock AgentKit.
 *
 * Deliberately distinct from the per-test humans minted in `test.ts`: the
 * provider's duplicate-human guard is keyed on (listing, human), so a spec that
 * reserved under this hash would collide with an agent run against the same
 * listing. Every spec that reserves directly gets its own hash instead.
 */
export const AGENT_HUMAN_ID_HASH = "sha256:e2e-live-agent";

/** Days of landlord document access the agent writes onto a receipt. */
export const AGENT_ACCESS_WINDOW_DAYS = 3;
