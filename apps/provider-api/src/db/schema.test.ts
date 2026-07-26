import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

// Apply every migration in order, so a new file is covered the moment it is added.
const drizzleDir = resolve(import.meta.dirname, "../../drizzle");
const migrationSql = readdirSync(drizzleDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(resolve(drizzleDir, file), "utf8"))
  .join("\n");

describe("provider database schema", () => {
  it("enforces one human hash per listing", () => {
    const db = newDb();
    db.public.none(migrationSql);

    db.public.none(`
      insert into listings (id, sui_listing_id, external_listing_id, provider_sui_address, landlord_sui_address, municipality_code, monthly_rent_eur, bedrooms)
      values ('listing_1', '0xlisting', 'demo-1', '0xprovider', '0xlandlord', 1, 1700, 2);
      insert into applications (id, listing_id, mandate_id, agent_sui_address, agent_evm_address, human_id_hash, walrus_blob_id, packet_hash, status, idempotency_key)
      values ('app_1', 'listing_1', '0xmandate', '0xagent', '0xevm', 'sha256:human', 'mock:blob', '0xhash', 'reserved', 'idem-1');
      insert into human_listing_usage (listing_id, human_id_hash, application_id)
      values ('listing_1', 'sha256:human', 'app_1');
    `);

    expect(() =>
      db.public.none(`
        insert into applications (id, listing_id, mandate_id, agent_sui_address, agent_evm_address, human_id_hash, walrus_blob_id, packet_hash, status, idempotency_key)
        values ('app_2', 'listing_1', '0xmandate', '0xagent2', '0xevm2', 'sha256:human', 'mock:blob2', '0xhash2', 'reserved', 'idem-2');
        insert into human_listing_usage (listing_id, human_id_hash, application_id)
        values ('listing_1', 'sha256:human', 'app_2');
      `),
    ).toThrow();
  });

  it("keeps one packet per mandate and listing, replacing on re-upload", () => {
    const db = newDb();
    db.public.none(migrationSql);

    db.public.none(`
      insert into packets (mandate_id, provider_listing_id, walrus_blob_id, packet_hash, size_bytes, encryption_mode, registered_at_ms)
      values ('0xmandate', 'listing_1', 'blob_first', '0xhash1', 128, 'seal', 1000)
      on conflict (mandate_id, provider_listing_id) do update set
        walrus_blob_id = excluded.walrus_blob_id,
        packet_hash = excluded.packet_hash,
        registered_at_ms = excluded.registered_at_ms;

      insert into packets (mandate_id, provider_listing_id, walrus_blob_id, packet_hash, size_bytes, encryption_mode, registered_at_ms)
      values ('0xmandate', 'listing_1', 'blob_second', '0xhash2', 256, 'seal', 2000)
      on conflict (mandate_id, provider_listing_id) do update set
        walrus_blob_id = excluded.walrus_blob_id,
        packet_hash = excluded.packet_hash,
        registered_at_ms = excluded.registered_at_ms;

      insert into packets (mandate_id, provider_listing_id, walrus_blob_id, packet_hash, size_bytes, encryption_mode, registered_at_ms)
      values ('0xmandate', 'listing_2', 'blob_third', '0xhash3', 256, 'seal', 3000);
    `);

    const rows = db.public.many(
      "select provider_listing_id, walrus_blob_id from packets where mandate_id = '0xmandate' order by provider_listing_id",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ provider_listing_id: "listing_1", walrus_blob_id: "blob_second" });
    expect(rows[1]).toMatchObject({ provider_listing_id: "listing_2", walrus_blob_id: "blob_third" });
  });

  it("stores receipt access expiry for provider read paths", () => {
    const db = newDb();
    db.public.none(migrationSql);

    db.public.none(`
      insert into listings (id, sui_listing_id, external_listing_id, provider_sui_address, landlord_sui_address, municipality_code, monthly_rent_eur, bedrooms)
      values ('listing_1', '0xlisting', 'demo-1', '0xprovider', '0xlandlord', 1, 1700, 2);
      insert into applications (id, listing_id, mandate_id, agent_sui_address, agent_evm_address, human_id_hash, walrus_blob_id, packet_hash, status, idempotency_key)
      values ('app_1', 'listing_1', '0xmandate', '0xagent', '0xevm', 'sha256:human', 'mock:blob', '0xhash', 'accepted', 'idem-1');
      insert into sui_receipts (receipt_id, application_id, tx_digest, mandate_id, listing_object_id, submitted_at_ms, access_expires_at_ms, raw_object)
      values ('0xreceipt', 'app_1', 'tx_1', '0xmandate', '0xlisting', 1784962851988, 1790000000000, '{}');
    `);

    const [row] = db.public.many("select access_expires_at_ms from sui_receipts where receipt_id = '0xreceipt'");
    expect(row).toMatchObject({ access_expires_at_ms: 1_790_000_000_000 });
  });
});
