import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(resolve(import.meta.dirname, "../../drizzle/0001_initial.sql"), "utf8");

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
});
