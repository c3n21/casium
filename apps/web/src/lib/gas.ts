import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const DEFAULT_GAS_BUDGET_MIST = 100_000_000n;

export async function setExplicitGasPayment(
  tx: Transaction,
  client: ClientWithCoreApi,
  owner: string,
  budget: bigint = DEFAULT_GAS_BUDGET_MIST,
) {
  const coins = await client.core.listCoins({ owner, coinType: SUI_COIN_TYPE });
  const gasCoin = coins.objects
    .map((coin) => ({ ...coin, balanceMist: BigInt(coin.balance) }))
    .filter((coin) => coin.balanceMist >= budget)
    .sort((a, b) => Number(b.balanceMist - a.balanceMist))[0];

  if (!gasCoin) {
    throw new Error(`No SUI gas coin with at least ${budget} MIST found for ${owner}`);
  }

  tx.setGasBudget(budget);
  tx.setGasPayment([
    {
      objectId: gasCoin.objectId,
      version: gasCoin.version,
      digest: gasCoin.digest,
    },
  ]);
}
