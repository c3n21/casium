// RD-185: server-side `landlord` filter on GET /applications, exercised against
// the DB (Postgres) branch of `listAll`. Hermetic: uses pg-mem (`newDb()`) wrapped
// in drizzle's node-postgres adapter, applying every migration in
// `apps/provider-api/drizzle/*.sql` in order — same pattern as
// `src/db/schema.test.ts`. No live Postgres container is touched.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LANDLORD_ADDRESS, PUBLISHER_ADDRESS } from "@casium/contracts-config";
import { drizzle } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import { applications as applicationsTable } from "../db/schema.js";
import { createApplicationService } from "./applications.js";
import { createListingService } from "./listings.js";

const drizzleDir = resolve(import.meta.dirname, "../../drizzle");
const migrationSql = readdirSync(drizzleDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(resolve(drizzleDir, file), "utf8"))
  .join("\n");

function createPgMemDb() {
  const mem = newDb();
  mem.public.none(migrationSql);
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  // Two incompatibilities between drizzle-orm's node-postgres driver and
  // pg-mem's `pg` adapter, worked around here so the DB branch can run
  // hermetically instead of being skipped:
  //  1. drizzle always attaches a custom `types.getTypeParser` to every query
  //     config; pg-mem's adapter throws "getTypeParser is not supported". We
  //     don't rely on custom type parsing here, so it's stripped.
  //  2. drizzle requests `rowMode: "array"` for typed selects (it maps
  //     `field`/column defs onto rows by position); pg-mem's adapter throws
  //     "pg rowMode" for that too. It's stripped from the request, and the
  //     object-keyed rows pg-mem returns are converted to arrays afterwards —
  //     Object.values() preserves insertion order, which matches the SQL
  //     driver's column order (both come from the same generated query), so
  //     drizzle's positional column mapping still lines up correctly.
  const rawQuery = pool.query.bind(pool);
  pool.query = ((config: unknown, values?: unknown) => {
    if (!config || typeof config !== "object") return rawQuery(config, values);

    const cfg = config as Record<string, unknown>;
    const wantsArrayRowMode = cfg.rowMode === "array";
    const stripped = { ...cfg };
    delete stripped.types;
    delete stripped.rowMode;

    const result = rawQuery(stripped, values);
    if (!wantsArrayRowMode) return result;

    return result.then((res: { rows: Record<string, unknown>[] }) => ({
      ...res,
      rows: res.rows.map((row) => Object.values(row)),
    }));
  }) as typeof pool.query;

  return drizzle(pool, { schema });
}

async function seedApplicationServiceWithTwoLandlords() {
  const db = createPgMemDb();

  // `createListingService` seeds the two demo listings (landlords
  // LANDLORD_ADDRESS and PUBLISHER_ADDRESS respectively) into `db`
  // asynchronously; `.get()` awaits that seed before reading.
  const listingService = createListingService(undefined, db);
  await listingService.get("listing_lisbon_eligible");

  const applicationService = createApplicationService(listingService, undefined, db);

  await db.insert(applicationsTable).values([
    {
      id: "app_lisbon",
      listingId: "listing_lisbon_eligible",
      mandateId: "0xmandate-1",
      agentSuiAddress: "0xagent1",
      agentEvmAddress: "0xevm1",
      humanIdHash: "sha256:human-1",
      walrusBlobId: "mock:blob-1",
      packetHash: "0xhash1",
      status: "reserved",
      idempotencyKey: "idem-1",
    },
    {
      id: "app_porto",
      listingId: "listing_porto_ineligible",
      mandateId: "0xmandate-2",
      agentSuiAddress: "0xagent2",
      agentEvmAddress: "0xevm2",
      humanIdHash: "sha256:human-2",
      walrusBlobId: "mock:blob-2",
      packetHash: "0xhash2",
      status: "reserved",
      idempotencyKey: "idem-2",
    },
  ]);

  return applicationService;
}

describe("ApplicationService.listAll landlord filter — Postgres branch (pg-mem)", () => {
  it("returns only applications on that landlord's listings", async () => {
    const applicationService = await seedApplicationServiceWithTwoLandlords();

    const lisbonOnly = await applicationService.listAll({ landlord: LANDLORD_ADDRESS });
    expect(lisbonOnly.map((a) => a.id)).toEqual(["app_lisbon"]);

    const portoOnly = await applicationService.listAll({ landlord: PUBLISHER_ADDRESS });
    expect(portoOnly.map((a) => a.id)).toEqual(["app_porto"]);
  });

  it("is case-insensitive when comparing the landlord address", async () => {
    const applicationService = await seedApplicationServiceWithTwoLandlords();

    const result = await applicationService.listAll({ landlord: LANDLORD_ADDRESS.toUpperCase() });
    expect(result.map((a) => a.id)).toEqual(["app_lisbon"]);
  });

  it("returns an empty array for an address with no listings", async () => {
    const applicationService = await seedApplicationServiceWithTwoLandlords();

    const result = await applicationService.listAll({
      landlord: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });
    expect(result).toEqual([]);
  });

  it("still supports the three existing filters, and no filters returns all", async () => {
    const applicationService = await seedApplicationServiceWithTwoLandlords();

    expect((await applicationService.listAll()).map((a) => a.id).sort()).toEqual([
      "app_lisbon",
      "app_porto",
    ]);

    expect(
      (await applicationService.listAll({ listingId: "listing_porto_ineligible" })).map(
        (a) => a.id,
      ),
    ).toEqual(["app_porto"]);

    expect(
      (await applicationService.listAll({ mandateId: "0xmandate-1" })).map((a) => a.id),
    ).toEqual(["app_lisbon"]);

    expect((await applicationService.listAll({ status: "reserved" })).map((a) => a.id).sort()).toEqual([
      "app_lisbon",
      "app_porto",
    ]);
    expect(await applicationService.listAll({ status: "accepted" })).toEqual([]);
  });
});
