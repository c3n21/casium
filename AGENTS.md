# Casium — agent instructions

<!-- CLAUDE.md is a pointer to this file. Keep every fact here; do not copy any of it there. -->

Casium — a scoped rental application agent on Sui and World. A renter creates an on-chain
`RentalMandate`; World AgentKit proves the agent is backed by a verified human; the agent
can only act within both constraints.

## Picking up work

**Read `plan/START.md`.** Do not read the whole backlog.

```bash
node scripts/backlog.mjs next          # what is ready to start
node scripts/backlog.mjs show RD-xxx   # the ticket + exactly which files to load
```

Tickets are one file each in `plan/tickets/`. Binding constraints are in `plan/rules/`,
loaded per ticket. `plan/state.md` is generated — never edit it by hand.

## Hard constraints

The full set is `plan/rules/global.md`. These four are the ones that ruin work if missed:

- **Never fake Sui or World.** Mock only Walrus, Seal, and LLM fallbacks, and label a mock
  at every surface that displays it. Do not claim a live integration until it has been run.
- **Synthetic data only.** No real identity, financial, or tenant-screening data. Never
  commit keys, seeds, `.env` files, or raw World human IDs.
- **Walrus blobs are public and permanent.** Only ciphertext may be uploaded.
- **No address or object-ID literals in app code** — import from `@casium/contracts-config`
  and run `pnpm lint:object-ids`.

## Environment

- Arch Linux inside distrobox. **Not** NixOS; no Nix flakes.
- `sui` and `walrus` are installed in `~/.local/bin/` and are deliberately **not** on
  `PATH`. Invoke them by full path. Do not export `PATH` or edit shell startup files.
- Browser access comes from the agent harness, not this repo — read `docs/browser-testing.md`
  before any UI, wallet, or Seal work. Claude Code uses the `claude-in-chrome` skill;
  opencode uses the Playwright MCP in `opencode.json`. They do not share wallet state.
- `.playwright-wallet-profile/` holds a Slush **web**-wallet session. Do not install a
  browser extension and do not delete the profile. Re-authenticating is the user's action.
- `.playwright-mcp/` logs contain OAuth URLs and the user's email. Never commit or paste them.

## Repository structure

```
apps/
  web/            Next.js 16 + Sui dApp Kit frontend (renter, provider, landlord, agent)
  provider-api/   Hono API — listings, application reservation, receipt verification
  agent/          Deterministic Node.js agent — mandate-scoped, AgentKit-authenticated
  e2e/            Playwright, three tiers (stubbed / live / wallet)
packages/
  move/             Sui Move contracts (published to testnet)
  shared/           Zod schemas, constants, errors, packet document
  sui-client/       Sui gRPC client + PTB builders
  agentkit/         World AgentKit mock + real verifier
  walrus/           Walrus mock + browser HTTP + CLI adapters
  seal/             Seal client wrapper and browser decrypt flow
  contracts-config/ Deployed testnet package and object IDs
docs/               demo-script, sui-deployment, provider-api, world-agentkit,
                    walrus-adapter, seal, browser-testing, duplicate-human-demo, skills
spec/development-spec.md   Implementation contract (schemas, endpoints, Move)
plan/               See plan/START.md
```

`README.md` is authoritative for setup, env vars, and how to run the demo — prefer it over
this file for anything operational.

## Commands

```bash
pnpm install
pnpm -r --if-present build
pnpm -r --if-present test
pnpm backlog                 # validate the backlog
pnpm demo:duplicate-human
~/.local/bin/sui move build --path packages/move
~/.local/bin/sui move test  --path packages/move
```

## Skills

Installed per harness by the `skills` CLI into `.claude/skills/` (Claude Code),
`.agents/skills/` (Codex, OpenCode), and `.pi/skills/` (pi). 17 Sui/Walrus references
vendored from `mystenlabs/skills`, plus this repo's own `backlog` skill sourced from
`skills/`.

**Do not hand-edit vendored skills** — it breaks their recorded hash. **Do not symlink by
hand** — `npx skills add` does it. Before running any `skills` command, read
`docs/skills.md`: the CLI has several silent failure modes, including one that wipes
`skills-lock.json`.

Vendored skills may not be registered with the runtime `skill` tool — find them by file
search and read `SKILL.md` directly. **Repo rules above override skill docs.**

Vendored skills may not be registered with the runtime `skill` tool — find them by file
search and read `SKILL.md` directly. **Repo rules above override skill docs.**

## Known open thread

**RD-180.** Copying `.env.example` verbatim configures a mode the credentials cannot
satisfy, so *Start run* fails with `401 AGENTKIT_UNVERIFIED`. Deferred by the user. Do not
fix it inside an unrelated ticket, and do not claim live World verification on the demo
path until it is closed. See `plan/tickets/RD-180.md`.
