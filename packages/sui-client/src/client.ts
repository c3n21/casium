import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  buildCreateListingTx,
  buildCreateMandateTx,
  buildRevokeMandateTx,
  buildSubmitApplicationTx,
  buildWithdrawApplicationTx,
} from "./transactions.js";
import { parseListing, parseMandate, parseReceipt } from "./objects.js";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { RentDelegateClient, RentDelegateConfig } from "./types.js";

export function createRentDelegateClient(config: RentDelegateConfig, suiClient?: ClientWithCoreApi): RentDelegateClient {
  const client = suiClient ?? new SuiGrpcClient({ network: config.network, baseUrl: config.rpcUrl });

  async function getJsonObject(id: string): Promise<unknown> {
    const response = await client.core.getObject({
      objectId: id,
      include: { json: true },
    });

    const json = response.object?.json;

    if (!json) {
      throw new Error(`Sui object not found or missing JSON content: ${id}`);
    }

    return json;
  }

  return {
    async getMandate(id) {
      return parseMandate(await getJsonObject(id));
    },
    async getListing(id) {
      return parseListing(await getJsonObject(id));
    },
    async getReceipt(id) {
      return parseReceipt(await getJsonObject(id));
    },
    async findAgentCapForMandate(mandateId, agentSuiAddress) {
      const response = await client.core.listOwnedObjects({
        owner: agentSuiAddress,
        type: `${config.packageId}::rental::AgentCap`,
        include: { json: true },
      });

      const objects = response.objects ?? [];
      const matches = objects.filter((obj) => {
        const json = obj.json as Record<string, unknown> | undefined | null;
        if (!json) return false;
        const mandateIdField = json["mandate_id"] as { id: string } | string | undefined;
        const fieldId = typeof mandateIdField === "string" ? mandateIdField : mandateIdField?.id;
        return fieldId === mandateId;
      });

      if (matches.length === 0) return null;
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous AgentCap: found ${matches.length} caps for mandate ${mandateId}`,
        );
      }

      return matches[0].objectId ?? null;
    },
    buildCreateMandateTx(input) {
      return buildCreateMandateTx(config, input);
    },
    buildCreateListingTx(input) {
      return buildCreateListingTx(config, input);
    },
    buildSubmitApplicationTx(input) {
      return buildSubmitApplicationTx(config, input);
    },
    buildRevokeMandateTx(input) {
      return buildRevokeMandateTx(config, input);
    },
    buildWithdrawApplicationTx(input) {
      return buildWithdrawApplicationTx(config, input);
    },
  };
}
