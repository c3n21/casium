# Frontend rules (`apps/web`)

- Run `pnpm --filter @casium/web typecheck` after any wallet or transaction-result
  parsing change. `next build` can succeed while skipping type validation.
- BigInt gas budgets require the TypeScript target to be `ES2020` or newer.
- `next build` may mutate `apps/web/tsconfig.json` and re-add `.next/dev/types/**/*.ts`
  to `include`. If stale `.next/dev` validator files break typecheck while the source
  routes are valid, exclude `.next/dev` rather than editing source.
- `tsconfig.tsbuildinfo` is generated incremental state, not a source change.
- Do not change or remove a `data-testid` without updating `apps/e2e`. Selector churn
  is the main cost this repo pays for UI work.
- The frontend talks Sui **gRPC** through `@mysten/sui`. Do not assume legacy JSON-RPC
  endpoints when debugging.

## Styling (RD-214)

`apps/web` uses Tailwind v4 + shadcn primitives on the app's own palette. Two consequences
bite silently — both caused real regressions that code review did not catch:

- **Preflight is deliberately not imported.** `globals.css` imports the theme and utilities
  layers only, because the pages rely on browser-default margins and on that file's own
  element-level rules for `button`/`input`/`select`/`textarea`/`table`. So **every border
  needs an explicit `border-solid`** — `border`/`border-line` alone sets width and colour,
  and the browser default `border-style: none` wins. A vanished border is the usual symptom.
- **Utilities lose to unlayered rules.** Tailwind sits in `layer(utilities)`, so any
  unlayered rule in `globals.css` (bare `a`, `button,input,select,textarea`, `.eyebrow`, …)
  beats a utility on the same property regardless of specificity. Tailwind's `!` suffix is
  the escape hatch; two exist, at `app/page.tsx:53` and `app/agent/page.tsx:403`.

Primitives are at `@/components/ui/*` (Button, Card, Input, Textarea, Select, Badge, Alert,
Dialog, ScrollArea, Skeleton, Avatar). `Button` emits `data-ui="button"`/`"secondary"` from
its variant — legacy CSS and call sites depend on that. Note shadcn now generates **Base UI**,
not Radix. The palette lives in `globals.css` `:root`; expose new tokens through `@theme`
rather than editing those values.

`globals.css` also still carries ~29 in-use semantic classes (`.card`, `.stack`, `.badge`,
`.alert`, …), several composed dynamically (`` `badge ${mode}` ``). A plain reference scan
will call them dead. They are not.

## Visual regression checks

```bash
SHOT_LABEL=mylabel pnpm --filter @casium/e2e e2e:shots   # -> apps/e2e/screenshots/mylabel/
```

Captures `/`, `/renter`, `/provider`, `/landlord`, `/agent`. Diff a new label against an
earlier one; both cascade bugs above were found this way and only this way. Never write
screenshots into `apps/e2e/test-results/` — Playwright wipes that directory at the start of
every run.

**The stubbed tier cannot render `MandateForm`, `ListingForm`, `RevokeButton` or
`WithdrawButton`.** They gate on a real `useCurrentAccount()`, and `NEXT_PUBLIC_E2E_STUB_SUI`
only fakes an address inside the `/landlord` and `/agent` page components. Changes to those
four are unverifiable until the wallet tier (RD-143/RD-150) exists — say so rather than
implying they were checked.

`apps/web/vitest.config.ts` defines no `@/` path alias, so component modules cannot be
imported in unit tests (see RD-222).

## Running it locally

- Active development: `pnpm --filter @casium/web dev`.
- `pnpm --filter @casium/web start` serves a production build and does not hot-reload.
- Check port 3000 is free first; do not leave stale background servers running.
