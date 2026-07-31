"use client";

import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { CreateMandateSchema } from "@casium/shared";
import { createCasiumClient } from "@casium/sui-client";
import { useState, useEffect } from "react";
import { EXPLORER_TX, PACKAGE_ID } from "@/lib/constants";
import { signAndExecuteWithExplicitGas } from "@/lib/walletTransaction";
import type { CreateMandateInput } from "@casium/sui-client";
import { AGENT_API, fetchAgentIdentity } from "@/lib/agentApi";
import type { AgentIdentity } from "@/lib/agentApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MUNICIPALITIES = [
  { code: 1, label: "Lisbon" },
  { code: 2, label: "Oeiras" },
  { code: 3, label: "Cascais" },
  { code: 4, label: "Amadora" },
  { code: 5, label: "Almada" },
];

type CreatedMandate = {
  mandateId: string;
  ownerCapId: string;
  agentCapId: string;
  txDigest: string;
};

type MandateFormProps = { onCreated?: (mandate: CreatedMandate) => void };

type IdentityState =
  | { status: "loading" }
  | { status: "loaded"; identity: AgentIdentity }
  | { status: "error"; reason: string };

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function MandateForm({ onCreated }: MandateFormProps) {
  const account = useCurrentAccount();
  const currentClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identityState, setIdentityState] = useState<IdentityState>({ status: "loading" });
  const [showOverride, setShowOverride] = useState(false);

  const [fields, setFields] = useState({
    agentSuiAddress: "",
    agentEvmAddress: "",
    maxMonthlyRentEur: 2000,
    allowedMunicipalities: [1],
    minBedrooms: 1,
    remainingApplications: 3,
    permittedActions: 1,
    expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  // Fetch agent identity on mount and populate the address fields.
  useEffect(() => {
    fetchAgentIdentity().then((result) => {
      if (result.ok) {
        const { identity } = result;
        setFields((f) => ({
          ...f,
          agentSuiAddress: identity.agentSuiAddress,
          agentEvmAddress: identity.agentEvmAddress ?? "",
        }));
        setIdentityState({ status: "loaded", identity });

        // Warn (but don't block) when the agent targets a different package.
        if (identity.packageId && identity.packageId !== PACKAGE_ID) {
          console.warn(
            `[MandateForm] Agent targets package ${identity.packageId} but browser uses ${PACKAGE_ID}`,
          );
        }
      } else {
        setIdentityState({ status: "error", reason: result.reason });
      }
    });
  }, []);

  if (!account) {
    return (
      <div className="card">
        <p>Connect your Sui wallet to create a mandate.</p>
        <ConnectButton />
      </div>
    );
  }

  // Determine whether submit should be blocked and why.
  const submitBlockReason: string | null =
    identityState.status === "loading"
      ? "Connecting to agent…"
      : identityState.status === "error"
        ? `Agent offline: ${identityState.reason}`
        : identityState.identity.agentEvmAddress === null
          ? "Agent is not registered with World — agentEvmAddress is null"
          : null;

  const submitDisabled = busy || (submitBlockReason !== null && !showOverride);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;

    setError(null);
    setBusy(true);

    try {
      const parsed = CreateMandateSchema.safeParse(fields);
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(", "));
        return;
      }

      // Convert EVM address bytes after schema validation so a malformed address
      // cannot be silently truncated into a short byte vector (RD-163 cleanup).
      const agentEvmBytes = Array.from(
        Buffer.from(parsed.data.agentEvmAddress.slice(2), "hex"),
      );

      const input: CreateMandateInput = {
        agentSuiAddress: parsed.data.agentSuiAddress,
        agentEvmAddressBytes: agentEvmBytes,
        maxMonthlyRentEur: parsed.data.maxMonthlyRentEur,
        allowedMunicipalities: parsed.data.allowedMunicipalities,
        minBedrooms: parsed.data.minBedrooms,
        expiresAtMs: parsed.data.expiresAtMs,
        remainingApplications: parsed.data.remainingApplications,
        permittedActions: parsed.data.permittedActions,
      };

      const client = createCasiumClient({ network: "testnet", rpcUrl: "https://fullnode.testnet.sui.io:443", packageId: PACKAGE_ID });
      const tx = client.buildCreateMandateTx(input);

      const result = await signAndExecuteWithExplicitGas(dAppKit, currentClient, tx, account.address);
      const created = parseCreatedMandate(result.effects, result.objectTypes, PACKAGE_ID);

      onCreated?.({ ...created, txDigest: result.digest });
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
    <form onSubmit={handleSubmit} className="stack">
      <h2 className="mt-0">Create Rental Mandate</h2>

      {/* ── Agent identity card ── */}
      <div className={`${identityState.status === "loaded" ? "alert success" : identityState.status === "error" ? "alert error" : "alert"} text-sm`}>
        {identityState.status === "loading" && (
          <span className="text-muted-ink">Connecting to agent…</span>
        )}

        {identityState.status === "error" && (
          <span className="text-red">
            Agent offline: {identityState.reason}
            {" — "}
            <button
              type="button"
              onClick={() => setShowOverride(true)}
              className="cursor-pointer border-0 bg-transparent p-0 text-blue underline"
            >
              enter addresses manually
            </button>
          </span>
        )}

        {identityState.status === "loaded" && (
          <>
            <div className="mb-2">
              <strong>Agent</strong>
              {" "}
              <span
                className={`badge ${identityState.identity.agentkitMode === "mock" ? "warn" : "info"}`}
              >
                {identityState.identity.agentkitMode}
              </span>
            </div>
            <table className="text-[0.85rem]">
              <tbody>
                <tr>
                  <td className="pr-2 whitespace-nowrap text-muted-ink">Sui address</td>
                  <td>
                    <code title={identityState.identity.agentSuiAddress}>
                      {truncate(identityState.identity.agentSuiAddress)}
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="pr-2 whitespace-nowrap text-muted-ink">EVM address</td>
                  <td>
                    {identityState.identity.agentEvmAddress ? (
                      <code title={identityState.identity.agentEvmAddress}>
                        {truncate(identityState.identity.agentEvmAddress)}
                      </code>
                    ) : (
                      <span className="text-red">not registered with World</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            {!identityState.identity.agentEvmAddress && (
              <p className="mx-0 mt-2 mb-0 text-[0.8rem] text-red">
                Cannot create mandate: the agent has no World EVM address configured.
                Set <code>AGENTKIT_DEMO_AGENT_EVM_ADDRESS</code> (mock) or{" "}
                <code>AGENT_EVM_PRIVATE_KEY</code> (live) in the agent&apos;s environment.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Advanced override (dev / multi-agent) ── */}
      <details open={showOverride} onToggle={(e) => setShowOverride((e.target as HTMLDetailsElement).open)}>
        <summary className="text-[0.85rem]">
          Advanced: enter addresses manually (unverified)
        </summary>
        <div className="alert warn stack mt-2">
          <p className="m-0 text-[0.8rem]">
            These addresses are not verified against the agent service. Use only for development
            or when running a different agent instance.
          </p>
          <label>
            Agent Sui address (unverified)
            <Input
              type="text"
              value={fields.agentSuiAddress}
              onChange={(e) => setFields((f) => ({ ...f, agentSuiAddress: e.target.value }))}
              placeholder="0x…"
            />
          </label>
          <label>
            Agent EVM address (unverified — registered AgentBook address)
            <Input
              type="text"
              value={fields.agentEvmAddress}
              onChange={(e) => setFields((f) => ({ ...f, agentEvmAddress: e.target.value }))}
              placeholder="0x…"
            />
          </label>
        </div>
      </details>

      <label>
        Max monthly rent (EUR)
        <Input
          type="number"
          value={fields.maxMonthlyRentEur}
          onChange={(e) => setFields((f) => ({ ...f, maxMonthlyRentEur: Number(e.target.value) }))}
        />
      </label>

      <fieldset className="rounded-md border border-solid border-line p-3">
        <legend>Allowed municipalities</legend>
        {MUNICIPALITIES.map(({ code, label }) => (
          <label key={code} className="mb-1 flex items-center gap-2">
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
        <Input
          type="number"
          value={fields.minBedrooms}
          onChange={(e) => setFields((f) => ({ ...f, minBedrooms: Number(e.target.value) }))}
        />
      </label>

      <label>
        Remaining applications
        <Input
          type="number"
          value={fields.remainingApplications}
          onChange={(e) => setFields((f) => ({ ...f, remainingApplications: Number(e.target.value) }))}
        />
      </label>

      {/* Block submit with a specific reason when agent is not ready. */}
      {submitBlockReason && !showOverride && (
        <p role="alert" className="m-0 text-sm text-red">
          {submitBlockReason}
        </p>
      )}

      {error && <p role="alert" className="m-0 text-red">{error}</p>}

      <Button type="submit" disabled={submitDisabled}>
        {busy ? "Sending transaction…" : "Create mandate on testnet"}
      </Button>
    </form>
  );
}

function parseCreatedMandate(
  effects: unknown,
  objectTypes: unknown,
  packageId: string,
): Omit<CreatedMandate, "txDigest"> {
  if (!effects || typeof effects !== "object") {
    throw new Error("Transaction succeeded but did not include effects");
  }

  const typedEffects = effects as {
    created?: Array<{ objectId?: string; objectType?: string }>;
    changedObjects?: Array<{ objectId?: string; objectType?: string; idOperation?: string }>;
  };
  const typeByObject = objectTypes && typeof objectTypes === "object"
    ? objectTypes as Record<string, string>
    : {};

  const createdObjects = [
    ...(typedEffects.created ?? []),
    ...(typedEffects.changedObjects ?? []).filter((obj) => obj.idOperation === "Created"),
  ];

  const findId = (typeName: string) => {
    const type = `${packageId}::rental::${typeName}`;
    return createdObjects.find((obj) => {
      const objectType = obj.objectType ?? (obj.objectId ? typeByObject[obj.objectId] : undefined);
      return objectType?.startsWith(type);
    })?.objectId;
  };

  const mandateId = findId("RentalMandate");
  const ownerCapId = findId("OwnerCap");
  const agentCapId = findId("AgentCap");

  if (!mandateId || !ownerCapId || !agentCapId) {
    throw new Error("Transaction succeeded but created mandate objects could not be found");
  }

  return { mandateId, ownerCapId, agentCapId };
}
