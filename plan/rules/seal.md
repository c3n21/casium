# Seal rules

Read `docs/seal.md` before touching the policy or the decrypt path.

- The Seal namespace must be the **original (v1)** package ID. `@mysten/seal` rejects any
  other version with "Package … is not the first version" and resolves the latest version
  itself when dry-running `seal_approve_packet`. Only the PTB move-call target uses the
  latest package ID.
- Decryption identity is `{ mandateId, listingObjectId }`. Encryption and decryption must
  derive it the same way or the packet is unreadable.
- The only real access gate in this system is `seal_approve_packet`, and it lives in Move.
  Never label a filtered list "private", "authorized", or "access controlled" — server-side
  scoping is **not** authorization, and the docs must say so.
- Decrypted plaintext stays in memory. Access-grant logging records *that* a decrypt
  happened, never *what* was read.
- With `NEXT_PUBLIC_ENCRYPTION_MODE=mock`, the fallback banner must still show and the UI
  must not offer a Seal action it cannot complete.
- The denial matrix is unit-test proven in Move. Do not weaken a test to make a UI pass.
