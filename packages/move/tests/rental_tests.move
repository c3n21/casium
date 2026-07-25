#[test_only]
module rentdelegate::rental_tests;

use sui::clock;
use sui::test_scenario;
use rentdelegate::rental;

const OWNER: address = @0xA;
const AGENT: address = @0xB;
const PROVIDER: address = @0xC;
const LANDLORD: address = @0xD;
const OTHER: address = @0xE;

#[test]
fun metadata_version_is_one() {
    assert!(rental::metadata_version() == 1, 0);
}

#[test]
fun create_mandate_shares_mandate_and_transfers_caps() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    rental::create_mandate(
        AGENT,
        b"0x1111111111111111111111111111111111111111",
        1_800,
        vector[1, 2, 3],
        1,
        2_000,
        2,
        1,
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );
    clock::destroy_for_testing(test_clock);

    let effects = test_scenario::next_tx(&mut scenario, AGENT);
    assert!(test_scenario::num_user_events(&effects) == 1, 1);

    let agent_cap = test_scenario::take_from_sender<rental::AgentCap>(&scenario);
    assert!(rental::agent_cap_agent_sui(&agent_cap) == AGENT, 2);
    let agent_mandate_id = rental::agent_cap_mandate_id(&agent_cap);
    test_scenario::return_to_sender(&scenario, agent_cap);

    test_scenario::next_tx(&mut scenario, OWNER);
    let owner_cap = test_scenario::take_from_sender<rental::OwnerCap>(&scenario);
    assert!(rental::owner_cap_mandate_id(&owner_cap) == agent_mandate_id, 3);
    test_scenario::return_to_sender(&scenario, owner_cap);

    let mandate = test_scenario::take_shared<rental::RentalMandate>(&scenario);
    assert!(rental::mandate_id(&mandate) == agent_mandate_id, 4);
    assert!(rental::mandate_owner(&mandate) == OWNER, 5);
    assert!(rental::mandate_agent_sui(&mandate) == AGENT, 6);
    assert!(rental::mandate_remaining_applications(&mandate) == 2, 7);
    assert!(!rental::mandate_revoked(&mandate), 8);
    test_scenario::return_shared(mandate);

    test_scenario::end(scenario);
}

#[test]
fun create_listing_shares_provider_controlled_listing() {
    let mut scenario = test_scenario::begin(PROVIDER);
    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);

    rental::create_listing(
        b"lisbon-demo-1",
        LANDLORD,
        1,
        1_700,
        2,
        true,
        2_000,
        b"metadata:demo",
        &test_clock,
        test_scenario::ctx(&mut scenario),
    );
    clock::destroy_for_testing(test_clock);

    let effects = test_scenario::next_tx(&mut scenario, PROVIDER);
    assert!(test_scenario::num_user_events(&effects) == 1, 9);

    let listing = test_scenario::take_shared<rental::RentalListing>(&scenario);
    assert!(rental::listing_provider(&listing) == PROVIDER, 10);
    assert!(rental::listing_landlord(&listing) == LANDLORD, 11);
    assert!(rental::listing_municipality(&listing) == 1, 12);
    assert!(rental::listing_monthly_rent_eur(&listing) == 1_700, 13);
    assert!(rental::listing_bedrooms(&listing) == 2, 14);
    assert!(rental::listing_active(&listing), 15);
    test_scenario::return_shared(listing);

    test_scenario::end(scenario);
}

#[test]
fun valid_submit_application_creates_receipt_and_decrements_allowance() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 2, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);

    let effects = test_scenario::next_tx(&mut scenario, AGENT);
    assert!(test_scenario::num_user_events(&effects) == 1, 16);

    let receipt = test_scenario::take_shared<rental::ApplicationReceipt>(&scenario);
    assert!(rental::receipt_agent(&receipt) == AGENT, 17);
    assert!(rental::receipt_provider(&receipt) == PROVIDER, 18);
    assert!(rental::receipt_landlord(&receipt) == LANDLORD, 19);
    assert!(rental::receipt_status(&receipt) == rental::submitted_status(), 20);
    test_scenario::return_shared(receipt);

    let mandate = test_scenario::take_shared<rental::RentalMandate>(&scenario);
    assert!(rental::mandate_remaining_applications(&mandate) == 1, 21);
    assert!(rental::mandate_submitted_listing_count(&mandate) == 1, 22);
    test_scenario::return_shared(mandate);

    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 6)]
fun submit_rejects_rent_too_high() {
    let mut scenario = ready_application_scenario(1_600, vector[1], 1, 2_000, 1, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 7)]
fun submit_rejects_disallowed_municipality() {
    let mut scenario = ready_application_scenario(1_800, vector[2], 1, 2_000, 1, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 8)]
fun submit_rejects_too_few_bedrooms() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 3, 2_000, 1, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 2)]
fun submit_rejects_expired_mandate() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 1_050, 1, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 3)]
fun submit_rejects_revoked_mandate() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 1, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application_with_test_mutations(&mut scenario, 1_100, true, false);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 11)]
fun submit_rejects_zero_allowance() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 0, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 12)]
fun submit_rejects_missing_submit_permission() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 1, 0, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 4)]
fun submit_rejects_inactive_listing() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 1, 1, 1, 1_700, 2, false, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 5)]
fun submit_rejects_expired_listing() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 1, 1, 1, 1_700, 2, true, 1_050);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 10)]
fun submit_rejects_wrong_sender() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 1, 1, 1, 1_700, 2, true, 2_000);
    test_scenario::next_tx(&mut scenario, OTHER);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 9)]
fun submit_rejects_wrong_cap() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 1, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application_with_test_mutations(&mut scenario, 1_100, false, true);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 13)]
fun submit_rejects_duplicate_listing() {
    let mut scenario = ready_application_scenario(1_800, vector[1], 1, 2_000, 2, 1, 1, 1_700, 2, true, 2_000);
    submit_current_application(&mut scenario, 1_100, AGENT);
    test_scenario::next_tx(&mut scenario, AGENT);
    submit_current_application(&mut scenario, 1_200, AGENT);
    test_scenario::end(scenario);
}

fun ready_application_scenario(
    max_rent: u64,
    municipalities: vector<u64>,
    min_bedrooms: u64,
    mandate_expires_at_ms: u64,
    remaining_applications: u64,
    permitted_actions: u64,
    listing_municipality: u64,
    listing_rent: u64,
    listing_bedrooms: u64,
    listing_active: bool,
    listing_expires_at_ms: u64,
): test_scenario::Scenario {
    let mut scenario = test_scenario::begin(OWNER);
    let mut test_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut test_clock, 1_000);
    rental::create_mandate(AGENT, b"0x1111111111111111111111111111111111111111", max_rent, municipalities, min_bedrooms, mandate_expires_at_ms, remaining_applications, permitted_actions, &test_clock, test_scenario::ctx(&mut scenario));
    clock::destroy_for_testing(test_clock);

    test_scenario::next_tx(&mut scenario, PROVIDER);
    let mut listing_clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
    clock::set_for_testing(&mut listing_clock, 1_000);
    rental::create_listing(b"lisbon-demo-1", LANDLORD, listing_municipality, listing_rent, listing_bedrooms, listing_active, listing_expires_at_ms, b"metadata:demo", &listing_clock, test_scenario::ctx(&mut scenario));
    clock::destroy_for_testing(listing_clock);

    test_scenario::next_tx(&mut scenario, AGENT);
    scenario
}

fun submit_current_application(scenario: &mut test_scenario::Scenario, now_ms: u64, cap_owner: address) {
    submit_current_application_with_test_mutations(scenario, now_ms, false, false);
    cap_owner;
}

fun submit_current_application_with_test_mutations(
    scenario: &mut test_scenario::Scenario,
    now_ms: u64,
    revoke_mandate: bool,
    corrupt_cap: bool,
) {
    let mut test_clock = clock::create_for_testing(test_scenario::ctx(scenario));
    clock::set_for_testing(&mut test_clock, now_ms);
    let mut mandate = test_scenario::take_shared<rental::RentalMandate>(scenario);
    let listing = test_scenario::take_shared<rental::RentalListing>(scenario);
    let mut agent_cap = test_scenario::take_from_address<rental::AgentCap>(scenario, AGENT);

    if (revoke_mandate) {
        rental::revoke_for_testing(&mut mandate);
    };
    if (corrupt_cap) {
        rental::set_agent_cap_mandate_for_testing(&mut agent_cap, rental::listing_id(&listing));
    };

    rental::submit_application(&mut mandate, &listing, &agent_cap, b"blob", b"hash", 2_000, b"world", &test_clock, test_scenario::ctx(scenario));

    clock::destroy_for_testing(test_clock);
    test_scenario::return_to_sender(scenario, agent_cap);
    test_scenario::return_shared(listing);
    test_scenario::return_shared(mandate);
}
