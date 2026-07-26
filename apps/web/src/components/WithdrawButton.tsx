"use client";

import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { createCasiumClient } from "@casium/sui-client";
import { useState } from "react";
import { EXPLORER_TX, LATEST_PACKAGE_ID } from "@/lib/constants";
import { signAndExecuteWithExplicitGas } from "@/lib/walletTransaction";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

type WithdrawButtonProps = {
  applicationId: string;
  mandateId: string;
  receiptId: string;
  ownerCapId: string;
  onWithdrawn?: () => void;
};

export function WithdrawButton({
  applicationId,
  mandateId,
  receiptId,
  ownerCapId,
  onWithdrawn,
}: WithdrawButtonProps) {
  const account = useCurrentAccount();
  const currentClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!account) return null;

  async function handleWithdraw() {
    if (!account) return;
    if (!confirm("Withdraw this application? This cannot be undone.")) return;
    setError(null);
    setBusy(true);

    try {
      const client = createCasiumClient({
        network: "testnet",
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        packageId: LATEST_PACKAGE_ID,
      });

      const tx = client.buildWithdrawApplicationTx({ mandateId, receiptId, ownerCapId });
      const result = await signAndExecuteWithExplicitGas(dAppKit, currentClient, tx, account.address);
      const digest = result.digest;

      // Notify the provider API
      await fetch(`${PROVIDER_API}/applications/${applicationId}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txDigest: digest, receiptId }),
      });

      setTxDigest(digest);
      onWithdrawn?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-block" }}>
      {txDigest ? (
        <span>
          Withdrawn.{" "}
          <a href={EXPLORER_TX(txDigest)} target="_blank" rel="noreferrer">
            View tx
          </a>
        </span>
      ) : (
        <button
          onClick={handleWithdraw}
          disabled={busy}
          style={{
            padding: "0.3rem 0.75rem",
            background: busy ? "#94a3b8" : "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: busy ? "default" : "pointer",
            fontSize: "0.85rem",
          }}
        >
          {busy ? "Withdrawing…" : "Withdraw"}
        </button>
      )}
      {error && (
        <p role="alert" style={{ color: "#dc2626", margin: "4px 0 0", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
