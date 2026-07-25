module rentdelegate::rental;

use sui::clock::{Self, Clock};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const METADATA_VERSION: u64 = 1;
const STATUS_SUBMITTED: u8 = 1;

const EINVALID_EXPIRY: u64 = 1;

public struct RentalMandate has key {
    id: UID,
    owner: address,
    agent_sui: address,
    agent_evm: vector<u8>,
    max_monthly_rent_eur: u64,
    allowed_municipalities: vector<u64>,
    min_bedrooms: u64,
    expires_at_ms: u64,
    remaining_applications: u64,
    revoked: bool,
    permitted_actions: u64,
    created_at_ms: u64,
    metadata_version: u64,
}

public struct OwnerCap has key {
    id: UID,
    mandate_id: ID,
}

public struct AgentCap has key {
    id: UID,
    mandate_id: ID,
    agent_sui: address,
}

public struct RentalListing has key {
    id: UID,
    external_listing_id: vector<u8>,
    provider: address,
    landlord: address,
    municipality: u64,
    monthly_rent_eur: u64,
    bedrooms: u64,
    active: bool,
    expires_at_ms: u64,
    metadata_ref: vector<u8>,
    created_at_ms: u64,
}

#[allow(unused_field)]
public struct ApplicationReceipt has key {
    id: UID,
    mandate_id: ID,
    listing_id: ID,
    agent: address,
    provider: address,
    landlord: address,
    walrus_blob_id: vector<u8>,
    packet_hash: vector<u8>,
    submitted_at_ms: u64,
    access_expires_at_ms: u64,
    status: u8,
    world_ref_hash: vector<u8>,
}

public struct MandateCreated has copy, drop {
    mandate_id: ID,
    owner: address,
    agent_sui: address,
}

public struct ListingCreated has copy, drop {
    listing_id: ID,
    provider: address,
    landlord: address,
}

#[allow(unused_field)]
public struct ApplicationSubmitted has copy, drop {
    receipt_id: ID,
    mandate_id: ID,
    listing_id: ID,
    agent: address,
    remaining_applications: u64,
}

public fun metadata_version(): u64 {
    METADATA_VERSION
}

public fun create_mandate(
    agent_sui: address,
    agent_evm: vector<u8>,
    max_monthly_rent_eur: u64,
    allowed_municipalities: vector<u64>,
    min_bedrooms: u64,
    expires_at_ms: u64,
    remaining_applications: u64,
    permitted_actions: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock::timestamp_ms(clock);
    assert!(expires_at_ms > now_ms, EINVALID_EXPIRY);

    let owner = tx_context::sender(ctx);
    let mandate = RentalMandate {
        id: object::new(ctx),
        owner,
        agent_sui,
        agent_evm,
        max_monthly_rent_eur,
        allowed_municipalities,
        min_bedrooms,
        expires_at_ms,
        remaining_applications,
        revoked: false,
        permitted_actions,
        created_at_ms: now_ms,
        metadata_version: METADATA_VERSION,
    };
    let mandate_id = object::id(&mandate);
    let owner_cap = OwnerCap { id: object::new(ctx), mandate_id };
    let agent_cap = AgentCap { id: object::new(ctx), mandate_id, agent_sui };

    event::emit(MandateCreated { mandate_id, owner, agent_sui });
    transfer::share_object(mandate);
    transfer::transfer(owner_cap, owner);
    transfer::transfer(agent_cap, agent_sui);
}

public fun create_listing(
    external_listing_id: vector<u8>,
    landlord: address,
    municipality: u64,
    monthly_rent_eur: u64,
    bedrooms: u64,
    active: bool,
    expires_at_ms: u64,
    metadata_ref: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock::timestamp_ms(clock);
    assert!(expires_at_ms > now_ms, EINVALID_EXPIRY);

    let provider = tx_context::sender(ctx);
    let listing = RentalListing {
        id: object::new(ctx),
        external_listing_id,
        provider,
        landlord,
        municipality,
        monthly_rent_eur,
        bedrooms,
        active,
        expires_at_ms,
        metadata_ref,
        created_at_ms: now_ms,
    };
    let listing_id = object::id(&listing);

    event::emit(ListingCreated { listing_id, provider, landlord });
    transfer::share_object(listing);
}

public fun mandate_id(mandate: &RentalMandate): ID { object::id(mandate) }
public fun mandate_owner(mandate: &RentalMandate): address { mandate.owner }
public fun mandate_agent_sui(mandate: &RentalMandate): address { mandate.agent_sui }
public fun mandate_remaining_applications(mandate: &RentalMandate): u64 { mandate.remaining_applications }
public fun mandate_revoked(mandate: &RentalMandate): bool { mandate.revoked }

public fun owner_cap_mandate_id(cap: &OwnerCap): ID { cap.mandate_id }
public fun agent_cap_mandate_id(cap: &AgentCap): ID { cap.mandate_id }
public fun agent_cap_agent_sui(cap: &AgentCap): address { cap.agent_sui }

public fun listing_id(listing: &RentalListing): ID { object::id(listing) }
public fun listing_provider(listing: &RentalListing): address { listing.provider }
public fun listing_landlord(listing: &RentalListing): address { listing.landlord }
public fun listing_municipality(listing: &RentalListing): u64 { listing.municipality }
public fun listing_monthly_rent_eur(listing: &RentalListing): u64 { listing.monthly_rent_eur }
public fun listing_bedrooms(listing: &RentalListing): u64 { listing.bedrooms }
public fun listing_active(listing: &RentalListing): bool { listing.active }

public fun submitted_status(): u8 { STATUS_SUBMITTED }
