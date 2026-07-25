"use client";

import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { CreateMandateSchema } from "@rentdelegate/shared";
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { useState } from "react";
import { EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";
import type { CreateMandateInput } from "@rentdelegate/sui-client";

const MUNICIPALITIES = [
  { code: 1, label: "Lisbon" },
  { code: 2, label: "Oeiras" },
  { code: 3, label: "Cascais" },
  { code: 4, label: "Amadora" },
  { code: 5, label: "Almada" },
];

type MandateFormProps = { onCreated?: (mandateId: string, txDigest: string) => void };

export function MandateForm({ onCreated }: MandateFormProps) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState({
    agentSuiAddress: "",
    agentEvmAddress: "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe",
    maxMonthlyRentEur: 2000,
    allowedMunicipalities: [1],
    minBedrooms: 1,
    remainingApplications: 3,
    permittedActions: 1,
    expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  if (!account) {
    return (
      <div>
        <p>Connect your Sui wallet to create a mandate.</p>
        <ConnectButton />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const parsed = CreateMandateSchema.safeParse(fields);
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(", "));
        return;
      }

      const agentEvmBytes = Array.from(
        Buffer.from(fields.agentEvmAddress.slice(2), "hex"),
      );

      const input: CreateMandateInput = {
        agentSuiAddress: fields.agentSuiAddress,
        agentEvmAddressBytes: agentEvmBytes,
        maxMonthlyRentEur: fields.maxMonthlyRentEur,
        allowedMunicipalities: fields.allowedMunicipalities,
        minBedrooms: fields.minBedrooms,
        expiresAtMs: fields.expiresAtMs,
        remainingApplications: fields.remainingApplications,
        permittedActions: fields.permittedActions,
      };

      const client = createRentDelegateClient({ network: "testnet", rpcUrl: "https://fullnode.testnet.sui.io:443", packageId: PACKAGE_ID });
      const tx = client.buildCreateMandateTx(input);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.FailedTransaction) throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");

      onCreated?.("(see tx)", result.Transaction.digest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleMunicipality(code: number) {
    setFields((f) => ({
      ...f,
      allowedMunicipalities: f.allowedMunicipalities.includes(code)
        ? f.allowedMunicipalities.filter((c) => c !== code)
        : [...f.allowedMunicipalities, code],
    }));
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Create Rental Mandate</h2>

      <label>
        Agent Sui address
        <input
          type="text"
          value={fields.agentSuiAddress}
          onChange={(e) => setFields((f) => ({ ...f, agentSuiAddress: e.target.value }))}
          placeholder="0x..."
          style={inputStyle}
        />
      </label>

      <label>
        Agent EVM address (registered AgentBook address)
        <input
          type="text"
          value={fields.agentEvmAddress}
          onChange={(e) => setFields((f) => ({ ...f, agentEvmAddress: e.target.value }))}
          style={inputStyle}
        />
      </label>

      <label>
        Max monthly rent (EUR)
        <input
          type="number"
          value={fields.maxMonthlyRentEur}
          onChange={(e) => setFields((f) => ({ ...f, maxMonthlyRentEur: Number(e.target.value) }))}
          style={inputStyle}
        />
      </label>

      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 4, padding: "0.75rem" }}>
        <legend>Allowed municipalities</legend>
        {MUNICIPALITIES.map(({ code, label }) => (
          <label key={code} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={fields.allowedMunicipalities.includes(code)}
              onChange={() => toggleMunicipality(code)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label>
        Min bedrooms
        <input
          type="number"
          value={fields.minBedrooms}
          onChange={(e) => setFields((f) => ({ ...f, minBedrooms: Number(e.target.value) }))}
          style={inputStyle}
        />
      </label>

      <label>
        Remaining applications
        <input
          type="number"
          value={fields.remainingApplications}
          onChange={(e) => setFields((f) => ({ ...f, remainingApplications: Number(e.target.value) }))}
          style={inputStyle}
        />
      </label>

      {error && <p role="alert" style={{ color: "#dc2626", margin: 0 }}>{error}</p>}

      <button type="submit" disabled={busy} style={buttonStyle}>
        {busy ? "Sending transaction…" : "Create mandate on testnet"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "0.5rem",
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  fontSize: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.7rem 1.2rem",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontSize: "inherit",
  cursor: "pointer",
};
