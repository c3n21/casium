---
letter: O
name: "Conversational Renter Experience"
range: 211-229
status: planned
---

# Epic O — Conversational Renter Experience

> Background only. You do **not** need this file to execute a ticket —
> `node scripts/backlog.mjs show RD-xxx` tells you what to load.
> Tickets live in `plan/tickets/`; status is in `plan/state.md`.

Parent index: `plan/backlog.md`. Prerequisite reading: `spec/development-spec.md` §packet,
`docs/seal.md`, `docs/provider-api.md`.

This epic replaces the renter's two forms with a conversation, and replaces the identity dossier the
renter uploads with an apartment-preferences document. It does not touch the Move package, the
AgentKit path, or the agent's execution logic.

## Why This Epic Exists

Three separate problems, which are cheaper to fix together than in sequence because they all land in
the same files.

### 1. The renter interface asks the renter to think in the system's vocabulary

`MandateForm` (`apps/web/src/components/MandateForm.tsx`, 392 lines) asks for a max rent in EUR, a set
of municipality *codes*, a minimum bedroom count, and a remaining-applications integer. Two of the
seven mandate fields have no control at all:

| Field | How the renter sets it | Evidence |
|---|---|---|
| `expiresAtMs` | They cannot. Hardcoded to `Date.now() + 30 days` in the initial state and never rendered. | `MandateForm.tsx:57` |
| `permittedActions` | They cannot. Hardcoded to `1`; it is a bitmask with no UI and no legend. | `MandateForm.tsx:56` |

The municipality list is duplicated in two places that must be kept in sync by hand — `MANDATE`'s
`MUNICIPALITIES` (`MandateForm.tsx:14-20`, five entries) and the renter page's
`MUNICIPALITY_LABELS` (`apps/web/app/renter/page.tsx:47-54`, six entries including
`6: "Porto (ineligible)"`). They already disagree.

A renter does not think "municipality code 2, minimum 1 bedroom, 3 remaining applications." They think
"somewhere near Oeiras, two bedrooms, under two thousand a month, I have a cat." The form is a
transcription task standing between the two.

### 2. The packet is an identity dossier, and the product claim is that nobody needs one

`PacketDocumentSchema` (`packages/shared/src/packet.ts:3-19`) is `renterName`, `nationalId`,
`payslipMonthlyNetEur`, `employerName`, `employmentType`, `referenceName`, `referenceRelation`,
`coverLetter`, `proofOfFundsEur`. Every field except the cover letter is personal data.

The intended product claim is that **the platform never learns who is renting or who is searching.**
Seal keeps that document from the provider, but the document itself is still built to carry an
identity — so the guarantee is "we encrypt your dossier", not "there is no dossier."

There is a second, quieter reason to change it. The hard constraints are **already public**:
`RentalMandate` is an on-chain object carrying `maxMonthlyRentEur`, `allowedMunicipalities`, and
`minBedrooms` (`packages/shared/src/schemas.ts:18-27`), readable by anyone. So a packet holding
"apartment information" would largely restate public data. What is *not* public, and what the
encrypted blob should actually hold, is the soft and unstructured part: the renter's own description,
their images, and preferences that no Move struct models.

That gives a clean division the current design does not have:

| Layer | Holds | Visibility |
|---|---|---|
| `RentalMandate` (Sui) | Hard, enforceable limits — rent ceiling, municipalities, bedrooms, application count, expiry | Public, on chain |
| Wants packet (Walrus + Seal) | Soft, subjective wants — description, images, furnished/pets/outdoor, move-in timing | Encrypted, landlord-only |

It also strengthens the core message rather than weakening it. If the landlord never learns who the
renter is, World is what makes an anonymous applicant trustworthy at all: a verified unique human,
not one of a thousand generated applications. **World proves the applicant is a real singular person;
Sui proves their agent cannot exceed its limits; neither requires a name.**

### 3. The visual layer is a design system that the components bypass

`apps/web/app/globals.css` (124 lines) is a coherent, deliberate system — a warm paper/ink palette,
gradient washes, a masked grid overlay, and semantic classes (`.card`, `.step-card`, `.alert`,
`.badge`, `.listing-option`). The components largely ignore it. `MandateForm.tsx:374-392` and
`PacketBuilder.tsx:291-292` each define local `inputStyle` / `buttonStyle` objects, and inline
`style={{…}}` props are spread across roughly 4,000 lines of component code, frequently
hardcoding colors (`#64748b`, `#dc2626`, `#e2e8f0`) that duplicate CSS variables already defined in
`:root`.

The result is that the app has a design system and does not look like it has one.

## What This Epic Does Not Do

| Option | Why not |
|---|---|
| Change the Move package | The mandate struct, `seal_approve_packet`, and the receipt are correct and live-proven. This epic changes what the renter *types*, not what the chain enforces. No package upgrade. |
| Let the model sign anything | The mandate is a security boundary. Extraction output is a **proposal** that a human reviews and edits before a wallet signature. There is no path from model output to `signAndExecuteWithExplicitGas` that does not pass through a confirmation step. See *Rules* below. |
| Real speech or vision inference | Transcription and image understanding ship as labeled mock implementations behind the adapter interface, exactly as Walrus and AgentKit already do. A real whisper.cpp / vision-model path is a later ticket, not this epic. |
| Add authentication | Unchanged from Epic L: the provider has no session concept and this epic does not add one. |
| Chat on the agent, provider, or landlord pages | Those pages get the new design system (RD-219) and, for the landlord, a new packet renderer (RD-218). They do not become conversational. |
| Fix RD-180 | The AgentKit mode mismatch is still deferred and still unrelated. It will still break a full end-to-end run on the default `.env`; that is a precondition for demoing this epic, not part of it. |
| Store real identity or documents | Reinforced, not relaxed: see *Rules*. The packet has no PII fields after RD-211, and attachments are images of properties, not documents about people. |

## Rules For Every Ticket In This Epic

| Rule | Requirement |
|---|---|
| The model proposes, the human signs | Extraction output is rendered as an editable draft. Every field the model filled must be visible and changeable before the mandate transaction is built. No ticket may add a "just do it" path that skips the review card. |
| No personal data in the packet | After RD-211 the schema has no name, ID, employer, salary, or reference field, and none may be re-added. `containsPersonalData: z.literal(false)` makes the claim structural rather than a comment. |
| Attachments are property images, not documents | The picker accepts image MIME types only, enforces a per-file size cap, and carries a persistent inline warning — *attach photos of what you are looking for, not your ID, payslips, or anything personal.* The warning repeats on the review card, which is the last screen before bytes become permanent. |
| Free text is the one leak vector, and is treated as such | The prompt and note fields are stored verbatim, so the leak warning sits next to them, not in a tooltip. Any ticket that adds a new free-text field adds the warning with it. |
| The model never enters the browser bundle | `node-llama-cpp` is a native Node dependency. All inference happens in the route handler (RD-215). If a `packages/llm` import appears in a client component, the ticket is not done. |
| Mock labeling | `LLM_MODE` / `NEXT_PUBLIC_LLM_MODE` follows the Walrus and Seal precedent: the active mode is rendered from the resolved value, never from a prop default, at every surface that shows extraction output. A mocked extractor must say so in the UI. |
| Plaintext stays in memory | Inherited from RD-136 and unchanged. Decrypted packets are never logged, persisted, or sent to the provider. Attachment bytes obey the same rule. |
| Object IDs and addresses | No address literal in app code — import from `@casium/contracts-config`. Run `pnpm lint:object-ids` before claiming a ticket done. |
| Packet version compatibility | v1 packets exist on Walrus and in archived evidence. `PacketViewer` must keep rendering them. A migration that makes old blobs unreadable is a regression, not a cleanup. |

## Packet v2 — The Shape Everything Else Depends On

Settled here so ten tickets do not each invent it. RD-211 is the only ticket that may change it.

```ts
export const AttachmentSchema = z.object({
  name: z.string().min(1),
  mime: z.string().regex(/^image\//, "Attachments must be images"),
  sizeBytes: z.number().int().positive(),
  source: z.enum(["fixture", "user-supplied"]),
  base64: z.string().min(1),
});

export const WantsPacketSchema = z.object({
  type: z.literal("rental_wants_packet"),
  version: z.literal(2),
  containsPersonalData: z.literal(false),

  prompt: z.string().min(1),          // the renter's own description, verbatim
  note: z.string().optional(),        // short message to the landlord

  propertyType: z.enum(["apartment", "house", "studio", "room", "any"]),
  furnished: z.enum(["furnished", "unfurnished", "either"]),
  pets: z.boolean(),
  outdoorSpace: z.enum(["none", "balcony", "terrace", "garden", "either"]),
  parking: z.boolean(),
  moveInFromMs: z.number().int().positive(),
  maxCommuteMinutes: z.number().int().positive().optional(),

  attachments: z.array(AttachmentSchema).max(6),
  createdAtMs: z.number().int().positive(),
});
```

Three decisions embedded in that shape, recorded so they are not relitigated per-ticket:

1. **`containsPersonalData: z.literal(false)` replaces `synthetic: z.literal(true)`.** The old flag
   asserted "this dossier is fake." The new one asserts "there is no dossier." It is a literal for the
   same reason the old one was: a document that violates it cannot be constructed.
2. **`source` is per-attachment, not per-packet.** The landlord sees which images came from the repo's
   demo fixtures and which the renter supplied. A blanket document-level flag would over-claim as soon
   as one user file is present.
3. **Attachments are base64 inside the packet**, so there is one Seal encryption, one Walrus blob, and
   one `packetHash` — the existing `POST /packets` contract (`apps/provider-api/src/routes/packets.ts`)
   does not change. The `max(6)` and the per-file cap in RD-216 are what keep the blob a sane size.

---

## Recommended Order

RD-211 and RD-214 are the two roots and are independent, so the epic opens with both in parallel.

```
RD-211 (packet v2) ──┬─→ RD-212 (llm mock) ──┬─→ RD-213 (llama-cpp)   [optional]
                     │                       └─→ RD-215 (chat route) ──┐
                     ├─────────────────────────────────────────────────┼─→ RD-216 (chat UI)
                     │                                                 │        │
RD-214 (design) ─────┴──→ RD-219 (restyle)   [parallel, after 214]     │        ▼
                     │                                                 │   RD-217 (commit)
                     └──→ RD-218 (landlord)  ←── RD-211 ───────────────┘        │
                                    │                                           │
                                    └──────────────→ RD-220 (tests + docs) ←────┘
```

Useful concurrency is about three: one owner on the `packages/` root (RD-211 → RD-212 → RD-213), one
on the design system (RD-214 → RD-219), and one taking the renter flow (RD-215 → RD-216 → RD-217)
once its dependencies land. RD-214 is the exception to parallelism — it touches nearly every file in
`apps/web`, so land it before RD-216 and RD-219 rather than merging around it.

## Risks

| Risk | Ticket | Mitigation |
|---|---|---|
| The mock extractor is too obviously keyword-matching, and the conversation feels fake | RD-212 | Invest in the phrasing table and the `reasons` strings on listing matches. An explained match reads as competent even when the mechanism is simple. |
| RD-214's sweep collides with everything | RD-214 | Land it first and alone. It is the one ticket in the epic that should not run concurrently with anything. |
| v1 packets on Walrus become unreadable | RD-211, RD-218 | `PacketDocumentSchemaV1` stays exported and `AnyPacketSchema` branches on `version`; RD-218's acceptance criteria include an archived blob. |
| Attachments make blobs large enough to slow or fail Walrus upload | RD-216, RD-217 | `max(6)` attachments, a per-file cap enforced in both UI and route, and a visible total size on the review card. |
| A renter pastes identity data into the free-text prompt | RD-216, RD-217 | Persistent inline warning at both the composer and the review card. Accepted residual risk — free text is the one field that cannot be structurally constrained. |
| Silent LLM-mode downgrade repeats the RD-180 pattern | RD-213 | `LLM_MODE=llama-cpp` with a missing model is a startup failure, never a fallback to mock. |
| The E2E suite stays red for the length of the epic | RD-220 | Expected. RD-220 is scheduled last precisely because the selectors are unstable until RD-217 lands; do not repair specs mid-epic. |

## Definition Of Done

1. A renter describes a home in text, images, and voice, and never sees a municipality code.
2. The extracted mandate is reviewed and editable before any wallet signature, and the review step is
   covered by a test.
3. The encrypted packet contains no personal data, and the schema makes it impossible for it to.
4. The landlord decrypts an anonymous wants profile, sees a World uniqueness attestation instead of a
   name, and can express interest.
5. Both packet versions render; archived Walrus blobs still open.
6. `pnpm -r build`, `pnpm -r test`, and `pnpm test:e2e` pass; `spec/development-spec.md` and the docs
   describe the system that exists.
