# Global rules

Apply to every ticket. Violating one fails the ticket regardless of the code.

## Honesty about integrations

- Never fake Sui or World. Mock only Walrus, Seal, and LLM fallbacks.
- A mock must be labeled at **every** surface that shows it — UI, README, docs.
  Render the label from the resolved mode value, never from a prop default.
- Do not claim a live integration until it has actually been run. "The code path
  exists" is not evidence; a transaction digest or a captured response is.

## Privacy and safety

- Synthetic data only. Never add real identity, financial, or tenant-screening data.
- Never commit wallet seeds, private keys, mnemonics, `.env` files, or raw World
  human IDs. Store only `humanIdHash`.
- Walrus blobs are public and permanent. Only ciphertext may be uploaded.
- Decrypted plaintext stays in memory — never logged, persisted, or sent to the provider.
- Lease signing and fund transfer are out of scope and must not be presented as permissions.

## Code constraints

- No address or object-ID literals in app code — import from `@casium/contracts-config`.
  Run `pnpm lint:object-ids` before claiming a ticket done.
- Do not use transaction digests or placeholder strings as object IDs.

## Environment

- Arch Linux inside distrobox. Not NixOS, no Nix flakes.
- `sui` and `walrus` live in `~/.local/bin/` and are **not** on `PATH`. Invoke them by
  full path. Do not export `PATH` globally and do not edit shell startup files.

## Ticket discipline

- Own one ticket at a time. Do not start one whose `deps` are unfinished.
- Update `status` in the ticket's own frontmatter; put evidence in `plan/evidence/<id>.md`,
  never in the ticket body.
- Respect `owns` — if another in-progress ticket lists a path you need, coordinate first.
- Run `node scripts/backlog.mjs check` before handing off.
