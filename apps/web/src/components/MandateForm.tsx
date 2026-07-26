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
      <div>
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Create Rental Mandate</h2>

      {/* ── Agent identity card ── */}
      <div style={{
        padding: "0.75rem 1rem",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        background: identityState.status === "loaded"
          ? "#f0fdf4"
          : identityState.status === "error"
            ? "#fef2f2"
            : "#f8fafc",
        fontSize: "0.9rem",
      }}>
        {identityState.status === "loading" && (
          <span style={{ color: "#94a3b8" }}>Connecting to agent…</span>
        )}

        {identityState.status === "error" && (
          <span style={{ color: "#dc2626" }}>
            Agent offline: {identityState.reason}
            {" — "}
            <button
              type="button"
              onClick={() => setShowOverride(true)}
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              enter addresses manually
            </button>
          </span>
        )}

        {identityState.status === "loaded" && (
          <>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Agent</strong>
              {" "}
              <span
                style={{
                  display: "inline-block",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  background: identityState.identity.agentkitMode === "mock"
                    ? "#fef3c7"
                    : "#dbeafe",
                  color: identityState.identity.agentkitMode === "mock"
                    ? "#92400e"
                    : "#1e40af",
                }}
              >
                {identityState.identity.agentkitMode}
              </span>
            </div>
            <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: "0.5rem", color: "#64748b", whiteSpace: "nowrap" }}>Sui address</td>
                  <td>
                    <code title={identityState.identity.agentSuiAddress}>
                      {truncate(identityState.identity.agentSuiAddress)}
                    </code>
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingRight: "0.5rem", color: "#64748b", whiteSpace: "nowrap" }}>EVM address</td>
                  <td>
                    {identityState.identity.agentEvmAddress ? (
                      <code title={identityState.identity.agentEvmAddress}>
                        {truncate(identityState.identity.agentEvmAddress)}
                      </code>
                    ) : (
                      <span style={{ color: "#dc2626" }}>not registered with World</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            {!identityState.identity.agentEvmAddress && (
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#dc2626" }}>
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
        <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "#64748b" }}>
          Advanced: enter addresses manually (unverified)
        </summary>
        <div style={{ marginTop: "0.5rem", padding: "0.75rem", border: "1px solid #fde68a", borderRadius: 4, background: "#fffbeb", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#92400e" }}>
            These addresses are not verified against the agent service. Use only for development
            or when running a different agent instance.
          </p>
          <label>
            Agent Sui address (unverified)
            <input
              type="text"
              value={fields.agentSuiAddress}
              onChange={(e) => setFields((f) => ({ ...f, agentSuiAddress: e.target.value }))}
              placeholder="0x…"
              style={inputStyle}
            />
          </label>
          <label>
            Agent EVM address (unverified — registered AgentBook address)
            <input
              type="text"
              value={fields.agentEvmAddress}
              onChange={(e) => setFields((f) => ({ ...f, agentEvmAddress: e.target.value }))}
              placeholder="0x…"
              style={inputStyle}
            />
          </label>
        </div>
      </details>

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

      {/* Block submit with a specific reason when agent is not ready. */}
      {submitBlockReason && !showOverride && (
        <p role="alert" style={{ color: "#dc2626", margin: 0, fontSize: "0.9rem" }}>
          {submitBlockReason}
        </p>
      )}

      {error && <p role="alert" style={{ color: "#dc2626", margin: 0 }}>{error}</p>}

      <button type="submit" disabled={submitDisabled} style={buttonStyle}>
        {busy ? "Sending transaction…" : "Create mandate on testnet"}
      </button>
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
