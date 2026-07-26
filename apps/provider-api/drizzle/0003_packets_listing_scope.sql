-- Scope packet registrations to both mandate and provider listing.
-- Existing single-listing rows keep the historical default listing id.
alter table packets
  add column provider_listing_id text not null default 'listing_lisbon_eligible';

alter table packets
  drop constraint packets_pkey;

alter table packets
  add primary key (mandate_id, provider_listing_id);
