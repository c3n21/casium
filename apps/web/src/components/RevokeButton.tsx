"use client";

import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { useState } from "react";
import { EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";

type RevokeButtonProps = {
  mandateId: string;
  ownerCapId: string;
  onRevoked?: (txDigest: string) => void;
};

export function RevokeButton({ mandateId, ownerCapId, onRevoked }: RevokeButtonProps) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!account) return null;

  async function handleRevoke() {
    if (!confirm("Revoke this mandate? The agent will no longer be able to submit applications.")) return;
    setError(null);
    setBusy(true);

    try {
      const client = createRentDelegateClient({
        network: "testnet",
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        packageId: PACKAGE_ID,
      });
      const tx = client.buildRevokeMandateTx({ mandateId, ownerCapId });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.FailedTransaction) throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
      const digest = result.Transaction.digest;
      setTxDigest(digest);
      onRevoked?.(digest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      {txDigest ? (
        <p>
          ✅ Mandate revoked.{" "}
          <a href={EXPLORER_TX(txDigest)} target="_blank" rel="noreferrer">
            View tx
          </a>
        </p>
      ) : (
        <button
          onClick={handleRevoke}
          disabled={busy}
          style={{
            padding: "0.6rem 1rem",
            background: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "inherit",
          }}
        >
          {busy ? "Revoking…" : "Revoke mandate"}
        </button>
      )}
      {error && <p role="alert" style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
