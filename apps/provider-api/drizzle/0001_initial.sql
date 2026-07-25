create table listings (
  id text primary key,
  sui_listing_id text unique not null,
  external_listing_id text not null,
  provider_sui_address text not null,
  landlord_sui_address text not null,
  municipality_code bigint not null,
  monthly_rent_eur bigint not null,
  bedrooms integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table applications (
  id text primary key,
  listing_id text not null references listings(id),
  mandate_id text not null,
  agent_sui_address text not null,
  agent_evm_address text not null,
  human_id_hash text not null,
  walrus_blob_id text not null,
  packet_hash text not null,
  status text not null,
  idempotency_key text not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_evm_address, idempotency_key)
);

create table human_listing_usage (
  listing_id text not null references listings(id),
  human_id_hash text not null,
  application_id text not null references applications(id),
  created_at timestamptz not null default now(),
  primary key (listing_id, human_id_hash)
);

create table verified_agents (
  agent_evm_address text primary key,
  human_id_hash text not null,
  last_verified_at timestamptz not null,
  agentkit_metadata jsonb not null default '{}'
);

create table sui_receipts (
  receipt_id text primary key,
  application_id text not null references applications(id),
  tx_digest text not null unique,
  mandate_id text not null,
  listing_object_id text not null,
  submitted_at_ms bigint not null,
  raw_object jsonb not null,
  verified_at timestamptz not null default now()
);

create table document_access_grants (
  id text primary key,
  application_id text not null references applications(id),
  receipt_id text not null,
  requester_sui_address text not null,
  status text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
