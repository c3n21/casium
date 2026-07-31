# Move rules (`packages/move`)

Reference skills live in `.agents/skills/` — read `sui-move/SKILL.md`,
`modern-move-syntax/SKILL.md`, and `move-unit-testing/SKILL.md` before writing Move.
Repo constraints override skill docs.

- The package is published to **testnet** and IDs live in
  `packages/contracts-config/testnet.json`. Never hardcode a package ID elsewhere.
- A published package cannot be edited, only upgraded. An upgrade changes the latest
  package ID but **not** the Seal namespace, which stays pinned to v1.
- Before any TS client work depends on a change, hand off: package ID, function names,
  struct fields, error codes, and an example transaction command.
- Every new abort path needs a unit test proving it fires. The denial matrix is the
  strongest evidence this project has; keep it complete.

## Commands

    ~/.local/bin/sui move build --path packages/move
    ~/.local/bin/sui move test --path packages/move
