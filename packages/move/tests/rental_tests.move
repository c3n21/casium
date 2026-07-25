#[test_only]
module rentdelegate::rental_tests;

use sui::clock;
use sui::test_scenario;
use rentdelegate::rental;

const OWNER: address = @0xA;
const AGENT: address = @0xB;
const PROVIDER: address = @0xC;
const LANDLORD: address = @0xD;

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
