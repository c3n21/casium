#[test_only]
#[allow(deprecated_usage)]
module casium::seal_tests;

use sui::clock;
use sui::object;
use sui::test_scenario;
use sui::test_utils;
use casium::rental;

const LANDLORD: address = @0xD;
const OTHER: address = @0xE;

// ─── helpers ────────────────────────────────────────────────────────────────

/// Build a mandate, a receipt tied to that mandate, and the correct 64-byte
/// Seal identity.  Returns them all so each test can reuse or mutate them.
fun setup(
    landlord: address,
    status: u8,
    access_expires_at_ms: u64,
    scenario: &mut test_scenario::Scenario,
): (rental::RentalMandate, rental::ApplicationReceipt, vector<u8>) {
    let ctx = test_scenario::ctx(scenario);
    let mandate = rental::create_test_mandate(ctx);
    let mandate_id = object::id(&mandate);
    let listing_id = object::id_from_address(@0xABCD);
    let receipt = rental::create_test_receipt(
        mandate_id,
        listing_id,
        landlord,
        status,
        access_expires_at_ms,
        ctx,
    );
    let seal_id = rental::receipt_seal_identity(&receipt);
    (mandate, receipt, seal_id)
}

// ─── tests ──────────────────────────────────────────────────────────────────

#[test]
fun test_seal_approve_happy_path() {
    let mut scenario = test_scenario::begin(LANDLORD);
    let (mandate, receipt, seal_id) = setup(LANDLORD, rental::submitted_status(), 2_000, &mut scenario);

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000); // before expiry

    rental::seal_approve_for_testing(
        seal_id,
        &receipt,
        &mandate,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 17, location = casium::rental)]
fun test_seal_approve_wrong_sender() {
    // Scenario sender is OTHER, but receipt.landlord is LANDLORD → ESEAL_WRONG_SENDER
    let mut scenario = test_scenario::begin(OTHER);
    let (mandate, receipt, seal_id) = setup(LANDLORD, rental::submitted_status(), 2_000, &mut scenario);

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    rental::seal_approve_for_testing(
        seal_id,
        &receipt,
        &mandate,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 18, location = casium::rental)]
fun test_seal_approve_wrong_identity() {
    // Pass garbage bytes instead of the real seal id → ESEAL_WRONG_IDENTITY
    let mut scenario = test_scenario::begin(LANDLORD);
    let (mandate, receipt, _real_id) = setup(LANDLORD, rental::submitted_status(), 2_000, &mut scenario);

    let wrong_id = vector[0u8, 1u8, 2u8]; // clearly wrong length and content

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    rental::seal_approve_for_testing(
        wrong_id,
        &receipt,
        &mandate,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 19, location = casium::rental)]
fun test_seal_approve_withdrawn_status() {
    // Receipt status is STATUS_WITHDRAWN → ESEAL_WRONG_STATUS
    let mut scenario = test_scenario::begin(LANDLORD);
    let (mandate, receipt, seal_id) = setup(LANDLORD, rental::withdrawn_status(), 2_000, &mut scenario);

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    rental::seal_approve_for_testing(
        seal_id,
        &receipt,
        &mandate,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 20, location = casium::rental)]
fun test_seal_approve_expired_access() {
    // Clock is past access_expires_at_ms → ESEAL_EXPIRED_ACCESS
    let mut scenario = test_scenario::begin(LANDLORD);
    // access expires at 500 ms; clock will be at 1_000
    let (mandate, receipt, seal_id) = setup(LANDLORD, rental::submitted_status(), 500, &mut scenario);

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000); // past expiry

    rental::seal_approve_for_testing(
        seal_id,
        &receipt,
        &mandate,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 21, location = casium::rental)]
fun test_seal_approve_wrong_mandate() {
    // Pass a different mandate whose object ID does not match receipt.mandate_id → ESEAL_WRONG_MANDATE
    let mut scenario = test_scenario::begin(LANDLORD);
    let (mandate1, receipt, seal_id) = setup(LANDLORD, rental::submitted_status(), 2_000, &mut scenario);

    // Create a second, distinct mandate object
    let mandate2 = rental::create_test_mandate(test_scenario::ctx(&mut scenario));

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    // Pass mandate2 but receipt was tied to mandate1
    rental::seal_approve_for_testing(
        seal_id,
        &receipt,
        &mandate2,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate1);
    test_utils::destroy(mandate2);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 22, location = casium::rental)]
fun test_seal_approve_revoked_mandate() {
    // Mandate is revoked → ESEAL_MANDATE_REVOKED
    let mut scenario = test_scenario::begin(LANDLORD);
    let (mut mandate, receipt, seal_id) = setup(LANDLORD, rental::submitted_status(), 2_000, &mut scenario);

    rental::revoke_for_testing(&mut mandate);

    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    rental::seal_approve_for_testing(
        seal_id,
        &receipt,
        &mandate,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );

    clock::destroy_for_testing(test_clock);
    test_utils::destroy(mandate);
    test_utils::destroy(receipt);
    test_scenario::end(scenario);
}
