import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";
import { setExplicitGasPayment } from "./gas";

type DAppKitLike = {
  signTransaction(input: { transaction: Transaction }): Promise<{ bytes: string; signature: string }>;
};

export async function signAndExecuteWithExplicitGas(
  dAppKit: DAppKitLike,
  client: ClientWithCoreApi,
  tx: Transaction,
  owner: string,
) {
  await setExplicitGasPayment(tx, client, owner);

  const signed = await dAppKit.signTransaction({ transaction: tx });
  const result = await client.core.executeTransaction({
    transaction: base64ToBytes(signed.bytes),
    signatures: [signed.signature],
    include: { effects: true, objectTypes: true },
  });

  if (result.$kind === "FailedTransaction" || !result.Transaction.status.success) {
    const failed = result.$kind === "FailedTransaction" ? result.FailedTransaction : result.Transaction;
    throw new Error(failed.status.error?.message ?? "Transaction failed");
  }

  return result.Transaction;
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
