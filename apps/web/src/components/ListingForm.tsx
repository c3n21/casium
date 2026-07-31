"use client";

import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { normalizeSuiAddress, MUNICIPALITIES, MUNICIPALITY_LABELS } from "@casium/shared";
import { createCasiumClient } from "@casium/sui-client";
import { useState } from "react";
import { EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";
import { signAndExecuteWithExplicitGas } from "@/lib/walletTransaction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

// Code 6 (PORTO_INELIGIBLE_DEMO) must remain visible/selectable here since providers create
// listings for the demo-ineligible municipality too; the suffix is derived at the render site
// so the shared constant doesn't have to carry presentation text.
function municipalitySelectLabel(code: number): string {
  const base = MUNICIPALITY_LABELS[code as keyof typeof MUNICIPALITY_LABELS] ?? `Code ${code}`;
  return code === MUNICIPALITIES.PORTO_INELIGIBLE_DEMO ? `${base} (ineligible demo)` : base;
}

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
      <div className="card">
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
      const client = createCasiumClient({
        network: "testnet",
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        packageId: PACKAGE_ID,
      });

      const idBytes = Array.from(new TextEncoder().encode(fields.externalId));
      const landlordSuiAddress = parseSuiAddressField(fields.landlordAddress || account.address);
      const tx = client.buildCreateListingTx({
        externalListingIdBytes: idBytes,
        landlordSuiAddress,
        municipality: fields.municipality,
        monthlyRentEur: fields.monthlyRentEur,
        bedrooms: fields.bedrooms,
        active: fields.active,
        expiresAtMs: fields.expiresAtMs,
        metadataRefBytes: [],
      });

      const result = await signAndExecuteWithExplicitGas(dAppKit, currentClient, tx, account.address);

      const listingObjectId = findCreatedListingId(result.objectTypes);
      if (!listingObjectId) {
        throw new Error("Listing created on-chain but no RentalListing object found in effects");
      }

      const listing = await registerListing({
        listingObjectId,
        externalListingId: fields.externalId,
        providerSuiAddress: account.address,
        landlordSuiAddress,
        municipalityCode: fields.municipality,
        monthlyRentEur: fields.monthlyRentEur,
        bedrooms: fields.bedrooms,
        active: fields.active,
      });

      onCreated?.(listing.id, result.digest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <h3 className="mt-0">Create Listing</h3>

      <label>
        External listing ID
        <Input type="text" value={fields.externalId} onChange={(e) => setFields((f) => ({ ...f, externalId: e.target.value }))} />
      </label>

      <label>
        Landlord Sui address (leave blank to use your address)
        <Input type="text" value={fields.landlordAddress} onChange={(e) => setFields((f) => ({ ...f, landlordAddress: e.target.value }))} placeholder={account.address} />
      </label>

      <label>
        Municipality
        <select value={fields.municipality} onChange={(e) => setFields((f) => ({ ...f, municipality: Number(e.target.value) }))}>
          {Object.values(MUNICIPALITIES).map((code) => (
            <option key={code} value={code}>{municipalitySelectLabel(code)}</option>
          ))}
        </select>
      </label>

      <label>
        Monthly rent (EUR)
        <Input type="number" value={fields.monthlyRentEur} onChange={(e) => setFields((f) => ({ ...f, monthlyRentEur: Number(e.target.value) }))} />
      </label>

      <label>
        Bedrooms
        <Input type="number" value={fields.bedrooms} onChange={(e) => setFields((f) => ({ ...f, bedrooms: Number(e.target.value) }))} />
      </label>

      {error && <p role="alert" className="m-0 text-red">{error}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Create listing on testnet"}
      </Button>
    </form>
  );
}

/** `objectTypes` maps every changed object id to its full type; the listing is the one shared by `create_listing`. */
function findCreatedListingId(objectTypes: Record<string, string> | undefined): string | null {
  const entry = Object.entries(objectTypes ?? {}).find(([, type]) => type.endsWith("::rental::RentalListing"));
  return entry?.[0] ?? null;
}

type RegisterListingInput = {
  listingObjectId: string;
  externalListingId: string;
  providerSuiAddress: string;
  landlordSuiAddress: string;
  municipalityCode: number;
  monthlyRentEur: number;
  bedrooms: number;
  active: boolean;
};

async function registerListing(input: RegisterListingInput): Promise<{ id: string }> {
  const response = await fetch(`${PROVIDER_API}/listings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      `Listing is on-chain (${input.listingObjectId}) but the provider API rejected it: ${body?.error ?? response.status}`,
    );
  }

  return response.json() as Promise<{ id: string }>;
}

function parseSuiAddressField(address: string): string {
  const hex = address.slice(2);
  if (!/^0x[a-fA-F0-9]{1,64}$/.test(address)) {
    throw new Error("Expected a Sui address with 1 to 64 hex characters");
  }
  if (hex.length === 40) {
    throw new Error("Expected a Sui address, but this looks like a 40-hex EVM address");
  }
  return normalizeSuiAddress(address);
}
