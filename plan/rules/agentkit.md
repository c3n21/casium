# World AgentKit rules

Read `docs/world-agentkit.md` before changing verification.

- Real AgentKit verification is live for **one** registered EVM agent address on World Chain
  (`eip155:480`). Duplicate-human rejection across *two* agents backed by the same human is
  still only fixture-proven — do not claim live proof without checking RD-014 first.
- Raw World human identifiers are hashed immediately. Only `humanIdHash` is stored offchain.
- **RD-180 is open.** Copying `.env.example` verbatim puts the provider in
  `AGENTKIT_MODE=real` while the agent has no EVM key and falls back to mock headers, so a
  run fails with `401 AGENTKIT_UNVERIFIED`. Tests pass because nothing exercises that
  pairing. Do not "helpfully" fix it inside an unrelated ticket, and do not claim live World
  verification on the demo path until it is resolved.
- Never let a missing credential silently downgrade a mode. Either fail at startup naming
  the variable, or ship a default the configuration can actually satisfy.
- Registering an agent EVM key in AgentBook is a **user action**
  (`pnpm dlx @worldcoin/agentkit-cli register …`). Document it where the operator hits it.
