# Sui client and wallet rules

- Prefer wallet `signTransaction` plus app-side `executeTransaction` when
  `signAndExecuteTransaction` is unreliable or popup handoff fails.
- **Always set explicit gas before wallet signing.** Select a live SUI gas coin, call
  `tx.setGasBudget(...)` and `tx.setGasPayment(...)`. Never rely on unresolved wallet gas data.
- When parsing executed results for created object types, request
  `include: { effects: true, objectTypes: true }`.
- `effects.changedObjects` may omit `objectType`. Join created `objectId` values against
  `result.objectTypes[objectId]`.
- For `create_mandate`, extract and store all three object IDs: `RentalMandate`,
  `OwnerCap`, `AgentCap`. Never store a digest in place of an object ID.
- CLI object debugging: `sui client objects <address> --json`. `--address` is not supported
  by the installed CLI.

## Browser testing

Read `docs/browser-testing.md` first. Browser access comes from the agent harness, not
this repo, and the two supported paths do not share wallet state.

- Old wallet tabs hold stale transaction bytes and gas versions. Refreshing, closing, or
  reopening tabs mid-test is fine and often necessary.
- After changing signing or execution code, reload the app tab and start a **fresh** wallet
  request rather than approving an already-open one.
- A successful signature alone is not a passing test — verify post-approval app state too.
- Re-authenticating the wallet session is the user's action, never an agent's.
