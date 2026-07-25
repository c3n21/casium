import { ERROR_CODES, ReserveApplicationSchema } from "@rentdelegate/shared";
import type { ErrorCode } from "@rentdelegate/shared";
import type { ListingService } from "./listings.js";

export type AgentContext = {
  mode: "mock-agentkit";
  humanIdHash: string;
  agentEvmAddress: string;
  mandateAgentSuiAddress: string;
};

export type ReservedApplication = {
  id: string;
  listingId: string;
  listingObjectId: string;
  mandateId: string;
  agentSuiAddress: string;
  agentEvmAddress: string;
  humanIdHash: string;
  walrusBlobId: string;
  packetHash: string;
  status: "reserved";
  idempotencyKey: string;
  submitHint: {
    packageId: string | null;
    module: "rental";
    function: "submit_application";
    mandateId: string;
    listingObjectId: string;
    agentSuiAddress: string;
  };
};

type ReserveResult =
  | { ok: true; value: ReservedApplication; replayed: boolean }
  | { ok: false; error: ErrorCode };

export function createApplicationService(listingService: ListingService) {
  const applications = new Map<string, ReservedApplication>();
  const humanListingUsage = new Map<string, string>();
  const idempotency = new Map<string, { fingerprint: string; applicationId: string }>();

  return {
    reserve(listingId: string, input: unknown, agentContext: AgentContext): ReserveResult {
      const listing = listingService.get(listingId);

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

      if (parsed.data.agentSuiAddress.toLowerCase() !== agentContext.mandateAgentSuiAddress.toLowerCase()) {
        return { ok: false, error: ERROR_CODES.MANDATE_SUI_MISMATCH };
      }

      const fingerprint = JSON.stringify(parsed.data);
      const idempotencyKey = `${agentContext.agentEvmAddress.toLowerCase()}:${parsed.data.idempotencyKey}`;
      const existingIdempotency = idempotency.get(idempotencyKey);

      if (existingIdempotency) {
        if (existingIdempotency.fingerprint !== fingerprint) {
          return { ok: false, error: ERROR_CODES.IDEMPOTENCY_CONFLICT };
        }

        const existing = applications.get(existingIdempotency.applicationId);

        if (!existing) {
          return { ok: false, error: ERROR_CODES.SUI_MANDATE_REJECTED };
        }

        return { ok: true, value: existing, replayed: true };
      }

      const usageKey = `${listingId}:${agentContext.humanIdHash}`;

      if (humanListingUsage.has(usageKey)) {
        return { ok: false, error: ERROR_CODES.DUPLICATE_HUMAN_LISTING };
      }

      const id = `app_${applications.size + 1}`;
      const application: ReservedApplication = {
        id,
        listingId,
        listingObjectId: listing.listingObjectId,
        mandateId: parsed.data.mandateId,
        agentSuiAddress: parsed.data.agentSuiAddress,
        agentEvmAddress: parsed.data.agentEvmAddress,
        humanIdHash: agentContext.humanIdHash,
        walrusBlobId: parsed.data.walrusBlobId,
        packetHash: parsed.data.packetHash,
        status: "reserved",
        idempotencyKey: parsed.data.idempotencyKey,
        submitHint: {
          packageId: process.env.SUI_PACKAGE_ID ?? null,
          module: "rental",
          function: "submit_application",
          mandateId: parsed.data.mandateId,
          listingObjectId: listing.listingObjectId,
          agentSuiAddress: parsed.data.agentSuiAddress,
        },
      };

      applications.set(id, application);
      humanListingUsage.set(usageKey, id);
      idempotency.set(idempotencyKey, { fingerprint, applicationId: id });

      return { ok: true, value: application, replayed: false };
    },
    get(id: string): ReservedApplication | null {
      return applications.get(id) ?? null;
    },
  };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;
