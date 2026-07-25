import { ERROR_CODES, ReserveApplicationSchema, VerifyReceiptSchema } from "@rentdelegate/shared";
import type { ErrorCode } from "@rentdelegate/shared";
import type { AgentKitContext } from "@rentdelegate/agentkit";
import type { RentDelegateClient } from "@rentdelegate/sui-client";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  applications as applicationsTable,
  documentAccessGrants as grantsTable,
  humanListingUsage as humanListingUsageTable,
  listings as listingsTable,
  suiReceipts as suiReceiptsTable,
} from "../db/schema.js";
import type { ReceiptVerificationService, VerifiedReceipt } from "./suiVerifier.js";
import type { ListingService } from "./listings.js";

export type ReservedApplication = {
  id: string;
  listingId: string;
  listingObjectId: string;
  providerSuiAddress: string;
  landlordSuiAddress: string;
  mandateId: string;
  agentSuiAddress: string;
  agentEvmAddress: string;
  humanIdHash: string;
  walrusBlobId: string;
  packetHash: string;
  status: "reserved" | "accepted" | "withdrawn";
  idempotencyKey: string;
  submitHint: {
    packageId: string | null;
    module: "rental";
    function: "submit_application";
    mandateId: string;
    listingObjectId: string;
    agentSuiAddress: string;
  };
  receipt?: VerifiedReceipt;
};

export type AccessGrant = {
  id: string;
  applicationId: string;
  receiptId: string;
  requesterSuiAddress: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type ReserveResult =
  | { ok: true; value: ReservedApplication; replayed: boolean }
  | { ok: false; error: ErrorCode };

type VerifyResult = { ok: true; value: ReservedApplication } | { ok: false; error: ErrorCode };

type AccessGrantResult =
  | { ok: true; value: AccessGrant }
  | { ok: false; error: ErrorCode };

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "23505"
  );
}

function buildSubmitHint(
  mandateId: string,
  listingObjectId: string,
  agentSuiAddress: string,
): ReservedApplication["submitHint"] {
  return {
    packageId: process.env.SUI_PACKAGE_ID ?? null,
    module: "rental",
    function: "submit_application",
    mandateId,
    listingObjectId,
    agentSuiAddress,
  };
}

export function createApplicationService(
  listingService: ListingService,
  receiptVerifier?: ReceiptVerificationService,
  db?: Db,
  mandateReader?: Pick<RentDelegateClient, "getMandate">,
) {
  // In-memory state (used when db is absent)
  const applicationsMap = new Map<string, ReservedApplication>();
  const humanListingUsage = new Map<string, string>();
  const idempotency = new Map<string, { fingerprint: string; applicationId: string }>();
  const txDigests = new Set<string>();
  const accessGrantsMap = new Map<string, AccessGrant[]>(); // keyed by applicationId

  // ------- DB helpers -------

  async function dbGetApplication(id: string): Promise<ReservedApplication | null> {
    if (!db) return null;
    const rows = await db
      .select()
      .from(applicationsTable)
      .leftJoin(listingsTable, eq(applicationsTable.listingId, listingsTable.id))
      .where(eq(applicationsTable.id, id));
    if (!rows.length || !rows[0]) return null;
    const { applications: app, listings: listing } = rows[0];
    if (!app) return null;
    return {
      id: app.id,
      listingId: app.listingId,
      listingObjectId: listing?.suiListingId ?? "",
      providerSuiAddress: listing?.providerSuiAddress ?? "",
      landlordSuiAddress: listing?.landlordSuiAddress ?? "",
      mandateId: app.mandateId,
      agentSuiAddress: app.agentSuiAddress,
      agentEvmAddress: app.agentEvmAddress,
      humanIdHash: app.humanIdHash,
      walrusBlobId: app.walrusBlobId,
      packetHash: app.packetHash,
      status: app.status as ReservedApplication["status"],
      idempotencyKey: app.idempotencyKey,
      submitHint: buildSubmitHint(
        app.mandateId,
        listing?.suiListingId ?? "",
        app.agentSuiAddress,
      ),
    };
  }

  // ------- Internal shared get -------

  async function getApplication(id: string): Promise<ReservedApplication | null> {
    if (db) return dbGetApplication(id);
    return applicationsMap.get(id) ?? null;
  }

  // ------- Public service -------

  return {
    async reserve(
      listingId: string,
      input: unknown,
      agentContext: AgentKitContext,
    ): Promise<ReserveResult> {
      const listing = await listingService.get(listingId);

      if (!listing) {
        return { ok: false, error: ERROR_CODES.LISTING_NOT_FOUND };
      }

      const parsed = ReserveApplicationSchema.safeParse(input);

      if (!parsed.success || parsed.data.listingObjectId !== listing.listingObjectId) {
        return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
      }

      if (parsed.data.agentEvmAddress.toLowerCase() !== agentContext.agentEvmAddress.toLowerCase()) {
        return { ok: false, error: ERROR_CODES.MANDATE_EVM_MISMATCH };
      }

      if (
        agentContext.mandateAgentSuiAddress &&
        parsed.data.agentSuiAddress.toLowerCase() !==
          agentContext.mandateAgentSuiAddress.toLowerCase()
      ) {
        return { ok: false, error: ERROR_CODES.MANDATE_SUI_MISMATCH };
      }

      // ── Idempotency early-return (before the mandate chain fetch) ─────────────
      // Check idempotency BEFORE the on-chain mandate fetch so replayed identical
      // requests short-circuit without hitting the chain a second time.
      const fingerprint = JSON.stringify(parsed.data);
      const idempotencyKey = `${agentContext.agentEvmAddress.toLowerCase()}:${parsed.data.idempotencyKey}`;

      if (db) {
        const [existingIdem] = await db
          .select()
          .from(applicationsTable)
          .where(
            and(
              eq(applicationsTable.agentEvmAddress, agentContext.agentEvmAddress.toLowerCase()),
              eq(applicationsTable.idempotencyKey, parsed.data.idempotencyKey),
            ),
          );
        if (existingIdem) {
          const sameRequest =
            existingIdem.mandateId === parsed.data.mandateId &&
            existingIdem.walrusBlobId === parsed.data.walrusBlobId &&
            existingIdem.packetHash === parsed.data.packetHash;
          if (!sameRequest) {
            return { ok: false, error: ERROR_CODES.IDEMPOTENCY_CONFLICT };
          }
          const application = await dbGetApplication(existingIdem.id);
          if (!application) return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
          return { ok: true, value: application, replayed: true };
        }
      } else {
        const existingIdempotency = idempotency.get(idempotencyKey);
        if (existingIdempotency) {
          if (existingIdempotency.fingerprint !== fingerprint) {
            return { ok: false, error: ERROR_CODES.IDEMPOTENCY_CONFLICT };
          }
          const existing = applicationsMap.get(existingIdempotency.applicationId);
          if (!existing) {
            return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
          }
          return { ok: true, value: existing, replayed: true };
        }
      }
      // ── End idempotency early-return ──────────────────────────────────────────

      // ── On-chain mandate identity cross-check (RD-164) ────────────────────────
      // Compare the AgentKit-verified EVM signer and the request's Sui address
      // against the *actual on-chain* values stored in the mandate object.
      // This makes `agent_evm` a real constraint rather than a decoration.
      //
      // When no Sui client is available (e.g. tests without a node) we log a
      // warning and skip the check rather than silently passing or hard-failing.
      if (mandateReader) {
        let onChainMandate: Awaited<ReturnType<typeof mandateReader.getMandate>> | null = null;
        try {
          onChainMandate = await mandateReader.getMandate(parsed.data.mandateId);
        } catch {
          return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
        }

        if (!onChainMandate) {
          return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
        }

        // Check on-chain EVM address against the AgentKit-verified signer.
        if (onChainMandate.agentEvm === null || onChainMandate.agentEvm === "") {
          // Legacy mandate with empty agent_evm — reject to prevent silent hole.
          console.warn(
            `[reserve] mandate ${parsed.data.mandateId} has empty on-chain agent_evm — rejecting`,
          );
          return { ok: false, error: ERROR_CODES.MANDATE_EVM_MISMATCH };
        }
        if (
          onChainMandate.agentEvm.toLowerCase() !==
          agentContext.agentEvmAddress.toLowerCase()
        ) {
          return { ok: false, error: ERROR_CODES.MANDATE_EVM_MISMATCH };
        }

        // Check on-chain Sui address against the request body.
        if (
          onChainMandate.agentSui.toLowerCase() !==
          parsed.data.agentSuiAddress.toLowerCase()
        ) {
          return { ok: false, error: ERROR_CODES.MANDATE_SUI_MISMATCH };
        }

        // Reject revoked mandates before they reach submit_application.
        if (onChainMandate.revoked) {
          return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
        }
      } else {
        // No Sui client injected — check cannot run.
        console.warn(
          "[reserve] no mandateReader injected — on-chain identity pair is UNENFORCED for this request",
        );
      }
      // ── End on-chain check ────────────────────────────────────────────────────

      if (db) {

        // Check duplicate human per listing
        const [usageRow] = await db
          .select()
          .from(humanListingUsageTable)
          .where(
            and(
              eq(humanListingUsageTable.listingId, listingId),
              eq(humanListingUsageTable.humanIdHash, agentContext.humanIdHash),
            ),
          );

        if (usageRow) {
          return { ok: false, error: ERROR_CODES.DUPLICATE_HUMAN_LISTING };
        }

        const id = `app_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        try {
          await db.transaction(async (tx) => {
            await tx.insert(applicationsTable).values({
              id,
              listingId,
              mandateId: parsed.data.mandateId,
              agentSuiAddress: parsed.data.agentSuiAddress,
              agentEvmAddress: parsed.data.agentEvmAddress.toLowerCase(),
              humanIdHash: agentContext.humanIdHash,
              walrusBlobId: parsed.data.walrusBlobId,
              packetHash: parsed.data.packetHash,
              status: "reserved",
              idempotencyKey: parsed.data.idempotencyKey,
            });
            await tx.insert(humanListingUsageTable).values({
              listingId,
              humanIdHash: agentContext.humanIdHash,
              applicationId: id,
            });
          });
        } catch (e) {
          if (isUniqueViolation(e)) {
            return { ok: false, error: ERROR_CODES.DUPLICATE_HUMAN_LISTING };
          }
          throw e;
        }

        const application = await dbGetApplication(id);
        if (!application) return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
        return { ok: true, value: application, replayed: false };
      }

      // Memory mode (idempotency already handled above before the mandate check)
      const usageKey = `${listingId}:${agentContext.humanIdHash}`;

      if (humanListingUsage.has(usageKey)) {
        return { ok: false, error: ERROR_CODES.DUPLICATE_HUMAN_LISTING };
      }

      const id = `app_${applicationsMap.size + 1}`;
      const application: ReservedApplication = {
        id,
        listingId,
        listingObjectId: listing.listingObjectId,
        providerSuiAddress: listing.providerSuiAddress,
        landlordSuiAddress: listing.landlordSuiAddress,
        mandateId: parsed.data.mandateId,
        agentSuiAddress: parsed.data.agentSuiAddress,
        agentEvmAddress: parsed.data.agentEvmAddress,
        humanIdHash: agentContext.humanIdHash,
        walrusBlobId: parsed.data.walrusBlobId,
        packetHash: parsed.data.packetHash,
        status: "reserved",
        idempotencyKey: parsed.data.idempotencyKey,
        submitHint: buildSubmitHint(
          parsed.data.mandateId,
          listing.listingObjectId,
          parsed.data.agentSuiAddress,
        ),
      };

      applicationsMap.set(id, application);
      humanListingUsage.set(usageKey, id);
      idempotency.set(idempotencyKey, { fingerprint, applicationId: id });

      return { ok: true, value: application, replayed: false };
    },

    async get(id: string): Promise<ReservedApplication | null> {
      return getApplication(id);
    },

    async listAll(filters?: {
      listingId?: string;
      mandateId?: string;
      status?: string;
    }): Promise<ReservedApplication[]> {
      if (db) {
        const conditions = [];
        if (filters?.listingId) {
          conditions.push(eq(applicationsTable.listingId, filters.listingId));
        }
        if (filters?.mandateId) {
          conditions.push(eq(applicationsTable.mandateId, filters.mandateId));
        }
        if (filters?.status) {
          conditions.push(eq(applicationsTable.status, filters.status));
        }

        const rows = await db
          .select()
          .from(applicationsTable)
          .leftJoin(listingsTable, eq(applicationsTable.listingId, listingsTable.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined);

        return rows
          .filter((r) => r.applications !== null)
          .map((r) => {
            const app = r.applications;
            const listing = r.listings;
            return {
              id: app.id,
              listingId: app.listingId,
              listingObjectId: listing?.suiListingId ?? "",
              providerSuiAddress: listing?.providerSuiAddress ?? "",
              landlordSuiAddress: listing?.landlordSuiAddress ?? "",
              mandateId: app.mandateId,
              agentSuiAddress: app.agentSuiAddress,
              agentEvmAddress: app.agentEvmAddress,
              humanIdHash: app.humanIdHash,
              walrusBlobId: app.walrusBlobId,
              packetHash: app.packetHash,
              status: app.status as ReservedApplication["status"],
              idempotencyKey: app.idempotencyKey,
              submitHint: buildSubmitHint(
                app.mandateId,
                listing?.suiListingId ?? "",
                app.agentSuiAddress,
              ),
            };
          });
      }

      // Memory mode
      let results = [...applicationsMap.values()];
      if (filters?.listingId) {
        results = results.filter((a) => a.listingId === filters.listingId);
      }
      if (filters?.mandateId) {
        results = results.filter((a) => a.mandateId === filters.mandateId);
      }
      if (filters?.status) {
        results = results.filter((a) => a.status === filters.status);
      }
      return results;
    },

    async verify(id: string, input: unknown): Promise<VerifyResult> {
      const parsed = VerifyReceiptSchema.safeParse(input);

      if (!parsed.success || parsed.data.applicationId !== id) {
        return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
      }

      if (db) {
        // Check for duplicate tx digest in DB
        const [existingReceipt] = await db
          .select()
          .from(suiReceiptsTable)
          .where(eq(suiReceiptsTable.txDigest, parsed.data.txDigest));

        if (existingReceipt) {
          return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
        }
      } else {
        if (txDigests.has(parsed.data.txDigest)) {
          return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
        }
      }

      const application = await getApplication(id);

      if (!application || !receiptVerifier) {
        return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
      }

      const verified = await receiptVerifier.verify(application, parsed.data);

      if (!verified.ok) {
        return { ok: false, error: verified.error ?? ERROR_CODES.RECEIPT_INVALID };
      }

      const accepted: ReservedApplication = {
        ...application,
        status: "accepted",
        receipt: verified.value,
      };

      if (db) {
        await db
          .update(applicationsTable)
          .set({ status: "accepted" })
          .where(eq(applicationsTable.id, id));
        await db.insert(suiReceiptsTable).values({
          receiptId: parsed.data.receiptId,
          applicationId: id,
          txDigest: parsed.data.txDigest,
          mandateId: verified.value.mandateId,
          listingObjectId: verified.value.listingObjectId,
          submittedAtMs: verified.value.submittedAtMs,
          rawObject: verified.value.rawObject as Record<string, unknown>,
        });
      } else {
        applicationsMap.set(id, accepted);
        txDigests.add(parsed.data.txDigest);
      }

      return { ok: true, value: accepted };
    },

    async withdraw(
      id: string,
      body: { txDigest: string; receiptId: string },
    ): Promise<VerifyResult> {
      if (!body.txDigest || !body.receiptId) {
        return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
      }

      const application = await getApplication(id);

      if (!application) {
        return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
      }

      const withdrawn: ReservedApplication = { ...application, status: "withdrawn" };

      if (db) {
        await db
          .update(applicationsTable)
          .set({ status: "withdrawn" })
          .where(eq(applicationsTable.id, id));
      } else {
        applicationsMap.set(id, withdrawn);
      }

      return { ok: true, value: withdrawn };
    },

    async createAccessGrant(
      id: string,
      body: { requesterSuiAddress: string; expiresAt: string },
    ): Promise<AccessGrantResult> {
      const application = await getApplication(id);

      if (!application) {
        return { ok: false, error: ERROR_CODES.RECEIPT_INVALID };
      }

      const grantId = `grant_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const receiptId = application.receipt?.receiptId ?? "";
      const now = new Date().toISOString();

      const grant: AccessGrant = {
        id: grantId,
        applicationId: id,
        receiptId,
        requesterSuiAddress: body.requesterSuiAddress,
        status: "active",
        expiresAt: body.expiresAt,
        createdAt: now,
      };

      if (db) {
        await db.insert(grantsTable).values({
          id: grantId,
          applicationId: id,
          receiptId,
          requesterSuiAddress: body.requesterSuiAddress,
          status: "active",
          expiresAt: new Date(body.expiresAt),
        });
      } else {
        const existing = accessGrantsMap.get(id) ?? [];
        existing.push(grant);
        accessGrantsMap.set(id, existing);
      }

      return { ok: true, value: grant };
    },

    async listAccessGrants(id: string): Promise<AccessGrant[]> {
      if (db) {
        const rows = await db
          .select()
          .from(grantsTable)
          .where(eq(grantsTable.applicationId, id));
        return rows.map((r) => ({
          id: r.id,
          applicationId: r.applicationId,
          receiptId: r.receiptId,
          requesterSuiAddress: r.requesterSuiAddress,
          status: r.status,
          expiresAt: r.expiresAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }));
      }
      return accessGrantsMap.get(id) ?? [];
    },
  };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;
