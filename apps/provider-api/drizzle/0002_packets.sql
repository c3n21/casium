-- Renter packet registrations. Previously an in-process Map, which meant every
-- provider restart silently invalidated the demo: the agent reads this before
-- every run and reports the absence three steps later as
-- "No packet registered for mandate …".
--
-- Keyed by mandate: re-uploading a packet replaces the previous record.
create table packets (
  mandate_id text primary key,
  walrus_blob_id text not null,
  packet_hash text not null,
  size_bytes integer not null,
  encryption_mode text not null,
  registered_at_ms bigint not null
);
