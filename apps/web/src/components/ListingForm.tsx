"use client";

import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { useState } from "react";
import { EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";
import { signAndExecuteWithExplicitGas } from "@/lib/walletTransaction";

const MUNICIPALITY_LABELS: Record<number, string> = {
  1: "Lisbon",
  2: "Oeiras",
  3: "Cascais",
  4: "Amadora",
  5: "Almada",
  6: "Porto (ineligible demo)",
};

export function ListingForm({ onCreated }: { onCreated?: (listingId: string, txDigest: string) => void }) {
  const account = useCurrentAccount();
  const currentClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState({
    externalId: "lisbon-demo-1",
    landlordAddress: "",
    municipality: 1,
    monthlyRentEur: 1700,
    bedrooms: 2,
    active: true,
    expiresAtMs: Date.now() + 90 * 24 * 60 * 60 * 1000,
  });

  if (!account) {
    return (
      <div>
        <p>Connect your Sui wallet to create a listing.</p>
        <ConnectButton />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;

    setError(null);
    setBusy(true);

    try {
      const client = createRentDelegateClient({
        network: "testnet",
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        packageId: PACKAGE_ID,
      });

      const idBytes = Array.from(new TextEncoder().encode(fields.externalId));
      const tx = client.buildCreateListingTx({
        externalListingIdBytes: idBytes,
        landlordSuiAddress: fields.landlordAddress || account.address,
        municipality: fields.municipality,
        monthlyRentEur: fields.monthlyRentEur,
        bedrooms: fields.bedrooms,
        active: fields.active,
        expiresAtMs: fields.expiresAtMs,
        metadataRefBytes: [],
      });

      const result = await signAndExecuteWithExplicitGas(dAppKit, currentClient, tx, account.address);
      onCreated?.("(see tx)", result.digest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Create Listing</h3>

      <label>
        External listing ID
        <input type="text" value={fields.externalId} onChange={(e) => setFields((f) => ({ ...f, externalId: e.target.value }))} style={inputStyle} />
      </label>

      <label>
        Landlord Sui address (leave blank to use your address)
        <input type="text" value={fields.landlordAddress} onChange={(e) => setFields((f) => ({ ...f, landlordAddress: e.target.value }))} placeholder={account.address} style={inputStyle} />
      </label>

      <label>
        Municipality
        <select value={fields.municipality} onChange={(e) => setFields((f) => ({ ...f, municipality: Number(e.target.value) }))} style={inputStyle}>
          {Object.entries(MUNICIPALITY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </label>

      <label>
        Monthly rent (EUR)
        <input type="number" value={fields.monthlyRentEur} onChange={(e) => setFields((f) => ({ ...f, monthlyRentEur: Number(e.target.value) }))} style={inputStyle} />
      </label>

      <label>
        Bedrooms
        <input type="number" value={fields.bedrooms} onChange={(e) => setFields((f) => ({ ...f, bedrooms: Number(e.target.value) }))} style={inputStyle} />
      </label>

      {error && <p role="alert" style={{ color: "#dc2626", margin: 0 }}>{error}</p>}

      <button type="submit" disabled={busy} style={buttonStyle}>
        {busy ? "Sending…" : "Create listing on testnet"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", marginTop: 4, padding: "0.5rem", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: "inherit" };
const buttonStyle: React.CSSProperties = { padding: "0.7rem 1.2rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, fontSize: "inherit", cursor: "pointer" };
