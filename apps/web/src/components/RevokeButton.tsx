"use client";

import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { createCasiumClient } from "@casium/sui-client";
import { useState } from "react";
import { EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";
import { signAndExecuteWithExplicitGas } from "@/lib/walletTransaction";
import { Button } from "@/components/ui/button";

type RevokeButtonProps = {
  mandateId: string;
  ownerCapId: string;
  onRevoked?: (txDigest: string) => void;
};

export function RevokeButton({ mandateId, ownerCapId, onRevoked }: RevokeButtonProps) {
  const account = useCurrentAccount();
  const currentClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!account) return null;

  async function handleRevoke() {
    if (!account) return;
    if (!confirm("Revoke this mandate? The agent will no longer be able to submit applications.")) return;
    setError(null);
    setBusy(true);

    try {
      const client = createCasiumClient({
        network: "testnet",
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        packageId: PACKAGE_ID,
      });
      const tx = client.buildRevokeMandateTx({ mandateId, ownerCapId });
      const result = await signAndExecuteWithExplicitGas(dAppKit, currentClient, tx, account.address);
      const digest = result.digest;
      setTxDigest(digest);
      onRevoked?.(digest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {txDigest ? (
        <p>
          ✅ Mandate revoked.{" "}
          <a href={EXPLORER_TX(txDigest)} target="_blank" rel="noreferrer">
            View tx
          </a>
        </p>
      ) : (
        <Button variant="destructive" onClick={handleRevoke} disabled={busy}>
          {busy ? "Revoking…" : "Revoke mandate"}
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-red">{error}</p>}
    </div>
  );
}
