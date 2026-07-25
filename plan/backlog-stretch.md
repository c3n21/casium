# Epic X — Stretch Features (RD-202, RD-203)

Parent index: `plan/backlog.md`.

Genuinely optional scope. Nothing here is required for the full application; do not risk core Sui,
World, Walrus, or Seal stability for it.

> **RD-201 Seal Policy-Controlled Access — SUPERSEDED.**
> Seal is no longer a stretch. The single P2 ticket has been replaced by Epic S
> (`plan/backlog-seal.md`), RD-131 … RD-138, which covers the identity scheme, the Move policy
> function, the package upgrade, the client wrapper, renter encryption, landlord decryption, the
> denial matrix, and the evidence. The original RD-201 text is preserved in
> `plan/backlog-archive.md` history via git.

### RD-202 Agent Rotation UI

| Field | Value |
|---|---|
| Priority | P2 |
| Lane | L1/L7 |
| Objective | Let renter rotate authorized Sui and EVM agent addresses. |
| Suggested implementation | Expose `rotate_agent` transaction in Sui client and renter UI. Ensure old agent fails and new agent succeeds. |
| Files/modules | `packages/move/sources/rental.move`, `packages/sui-client/src/transactions.ts`, `apps/web/components/RotateAgentForm.tsx`. |
| Dependencies | RD-006, RD-103. |
| Blocks | None. |
| Acceptance criteria | New `AgentCap` transferred to new agent; mandate records new EVM/Sui addresses; old agent rejected. |
| Tests | Move rotation test; frontend manual. |
| Failure fallback | Keep rotation as CLI-only or remove from demo. |
| Sponsor | Sui. |
| Demo impact | Revocability/control enhancement. |

### RD-203 zkLogin Renter Onboarding

| Field | Value |
|---|---|
| Priority | P2 |
| Lane | L2/L7 |
| Objective | Explore zkLogin for renter onboarding only if core demo is stable. |
| Suggested implementation | Use Sui zkLogin docs and supported OIDC provider. Keep browser wallet as fallback. |
| Files/modules | `apps/web/src/lib/zklogin.ts`, `apps/web/app/renter/page.tsx`. |
| Dependencies | RD-106 stable. |
| Blocks | None. |
| Acceptance criteria | Renter can create mandate with zkLogin address in demo environment. |
| Tests | Manual login and transaction. |
| Failure fallback | Browser Sui wallet only. |
| Sponsor | Sui. |
| Demo impact | Nice onboarding story, not required. |

