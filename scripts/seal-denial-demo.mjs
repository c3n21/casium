#!/usr/bin/env node
/**
 * RD-137 — Seal Denial Proof Matrix
 *
 * Documents all seven denial paths for seal_approve_packet.
 * Move-level denials are proven by sui move test (28 tests, all passing).
 * Browser-level denials (wrong wallet, expired session) require a live browser
 * with Slush wallet — see docs/browser-testing.md.
 */

const DENIAL_MATRIX = [
  {
    case: 1,
    name: 'Wrong sender (not the receipt landlord)',
    abortCode: 17,
    abortName: 'ESEAL_WRONG_SENDER',
    proof: 'Move test: rentdelegate::seal_tests::test_seal_approve_wrong_sender',
    proofType: 'move-test',
  },
  {
    case: 2,
    name: 'Wrong identity (id does not match mandate+listing)',
    abortCode: 18,
    abortName: 'ESEAL_WRONG_IDENTITY',
    proof: 'Move test: rentdelegate::seal_tests::test_seal_approve_wrong_identity',
    proofType: 'move-test',
  },
  {
    case: 3,
    name: 'Withdrawn receipt (status != STATUS_SUBMITTED)',
    abortCode: 19,
    abortName: 'ESEAL_WRONG_STATUS',
    proof: 'Move test: rentdelegate::seal_tests::test_seal_approve_withdrawn_status',
    proofType: 'move-test',
  },
  {
    case: 4,
    name: 'Expired access window (clock > access_expires_at_ms)',
    abortCode: 20,
    abortName: 'ESEAL_EXPIRED_ACCESS',
    proof: 'Move test: rentdelegate::seal_tests::test_seal_approve_expired_access',
    proofType: 'move-test',
  },
  {
    case: 5,
    name: 'Wrong mandate object (mandate ID does not match receipt)',
    abortCode: 21,
    abortName: 'ESEAL_WRONG_MANDATE',
    proof: 'Move test: rentdelegate::seal_tests::test_seal_approve_wrong_mandate',
    proofType: 'move-test',
  },
  {
    case: 6,
    name: 'Revoked mandate',
    abortCode: 22,
    abortName: 'ESEAL_MANDATE_REVOKED',
    proof: 'Move test: rentdelegate::seal_tests::test_seal_approve_revoked_mandate',
    proofType: 'move-test',
  },
  {
    case: 7,
    name: 'Expired SessionKey',
    abortCode: null,
    abortName: null,
    proof: 'Client-side: SessionKey.isExpired() returns true; key servers reject stale session. Browser verification required.',
    proofType: 'browser-required',
  },
]

console.log('=== Seal Denial Proof Matrix ===')
console.log()
for (const d of DENIAL_MATRIX) {
  console.log(`Case ${d.case}: ${d.name}`)
  console.log(`  Abort code: ${d.abortCode !== null ? `${d.abortCode} (${d.abortName})` : 'N/A (client-side)'}`)
  console.log(`  Proof type: ${d.proofType}`)
  console.log(`  Evidence:   ${d.proof}`)
  console.log()
}

console.log('Move-level denial tests (6/7 cases): Run with:')
console.log('  ~/.local/bin/sui move test --path packages/move')
console.log()
console.log('Case 7 (expired SessionKey): Requires browser + Slush wallet.')
console.log('  See docs/browser-testing.md for the full verification flow.')
