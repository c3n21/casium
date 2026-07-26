alter table sui_receipts
  add column access_expires_at_ms bigint not null default 0;
