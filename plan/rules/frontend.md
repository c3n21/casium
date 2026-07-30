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

## Running it locally

- Active development: `pnpm --filter @casium/web dev`.
- `pnpm --filter @casium/web start` serves a production build and does not hot-reload.
- Check port 3000 is free first; do not leave stale background servers running.
