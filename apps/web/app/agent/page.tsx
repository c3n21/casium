"use client";

import { useState, useEffect, useRef } from "react";
import {
  SMOKE,
  INELIGIBLE_LISTING_OBJECT_ID,
  EXPLORER_TX,
  EXPLORER_OBJECT,
} from "@rentdelegate/contracts-config";
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { AGENT_API } from "@/lib/agentApi";
import { PACKAGE_ID, RPC_URL_TESTNET } from "@/lib/constants";
import { demoSession, type StoredListing } from "@/lib/demoSession";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

type HealthResponse = {
  ok: boolean;
  service: string;
  agentSuiAddress: string;
  agentEvmAddress: string | null;
  agentkitMode: string;
};

type TargetResult = {
  providerListingId: string;
  listingObjectId: string;
  status: "complete" | "ineligible" | "failed";
  reason?: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
};

type RunResult = {
  runId: string;
  mandateId: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
  status: "complete" | "ineligible" | "failed";
  reason?: string;
  error?: string;
  targets?: TargetResult[];
};

type RunRecord = {
  runId: string;
  status: "running" | "done" | "failed";
  result?: RunResult;
  error?: string;
};

const ALL_STAGES = [
  "loading-mandate",
  "evaluating",
  "uploading",
  "reserving",
  "submitting",
  "verifying",
  "complete",
] as const;

type Stage = (typeof ALL_STAGES)[number];

function StageList({ currentStage }: { currentStage: Stage | null }) {
  const currentIdx = currentStage ? ALL_STAGES.indexOf(currentStage) : -1;
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: "1rem 0" }}>
      {ALL_STAGES.map((stage, i) => {
        const done = currentIdx > i;
        const active = currentIdx === i;
        return (
          <li
            key={stage}
            style={{
              padding: "0.3rem 0",
              color: done ? "#16a34a" : active ? "#2563eb" : "#94a3b8",
              fontWeight: active ? 600 : undefined,
            }}
          >
            {done ? "✓ " : active ? "▶ " : "○ "}
            {stage}
          </li>
        );
      })}
    </ol>
  );
}

function isMandateEvmMismatch(text: string | null | undefined): boolean {
  return !!text?.includes("MANDATE_EVM_MISMATCH");
}

function ResultPanel({ result }: { result: RunResult }) {
  const evmMismatch =
    isMandateEvmMismatch(result.error) || isMandateEvmMismatch(result.reason);

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        background: result.status === "complete" ? "#f0fdf4" : result.status === "ineligible" ? "#fefce8" : "#fef2f2",
        border: `1px solid ${result.status === "complete" ? "#86efac" : result.status === "ineligible" ? "#fde047" : "#fca5a5"}`,
        borderRadius: 6,
      }}
    >
      <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
        Status: {result.status}
      </p>
      {result.reason && !evmMismatch && (
        <p style={{ margin: "0 0 0.5rem", color: "#92400e" }}>
          Reason: {result.reason}
        </p>
      )}
      {evmMismatch && (
        <p style={{ margin: "0 0 0.5rem", color: "#dc2626" }}>
          <strong>Mandate EVM mismatch.</strong> This mandate was not created for the current
          agent EVM signer — its <code>agent_evm</code> does not match the verified World
          identity. Create a fresh mandate on the{" "}
          <a href="/renter">Renter page</a> after confirming the agent identity, then upload a
          packet and return here.
        </p>
      )}
      {result.error && !evmMismatch && (
        <p style={{ margin: "0 0 0.5rem", color: "#dc2626" }}>
          Error: {result.error}
        </p>
      )}
      {result.txDigest && (
        <p style={{ margin: "0 0 0.25rem" }}>
          Tx:{" "}
          <a href={EXPLORER_TX(result.txDigest)} target="_blank" rel="noreferrer">
            <code>{result.txDigest.slice(0, 20)}…</code>
          </a>
        </p>
      )}
      {result.receiptId && (
        <p style={{ margin: "0 0 0.25rem" }}>
          Receipt:{" "}
          <a href={EXPLORER_OBJECT(result.receiptId)} target="_blank" rel="noreferrer">
            <code>{result.receiptId.slice(0, 20)}…</code>
          </a>
        </p>
      )}
      {result.applicationId && (
        <p style={{ margin: "0 0 0.25rem" }}>
          Application ID: <code>{result.applicationId}</code>
        </p>
      )}
      {result.blobId && (
        <p style={{ margin: result.targets && result.targets.length > 0 ? "0 0 0.5rem" : 0 }}>
          Blob ID: <code>{result.blobId}</code>
        </p>
      )}
      {result.targets && result.targets.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>Per-listing results:</p>
          {result.targets.map((t) => (
            <div
              key={t.providerListingId}
              style={{
                padding: "0.4rem 0.6rem",
                marginBottom: "0.3rem",
                background: "rgba(255,255,255,0.6)",
                borderRadius: 4,
                fontSize: "0.875rem",
              }}
            >
              <code>{t.providerListingId}</code> — {t.status}
              {t.txDigest && (
                <> — Tx: <code>{t.txDigest.slice(0, 16)}…</code></>
              )}
              {t.receiptId && (
                <> — Receipt: <code>{t.receiptId.slice(0, 16)}…</code></>
              )}
              {t.reason && <> — {t.reason}</>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunSection({
  title,
  mandateId,
  listingObjectId,
  description,
  mandateSource,
  smokeWarning,
  agentEvmAddress,
  targets,
}: {
  title: string;
  mandateId: string;
  listingObjectId?: string;
  description?: string;
  /** Label shown next to the mandate input to communicate where the ID came from. */
  mandateSource?: string;
  /** Show a warning banner that this is a smoke/archived mandate. */
  smokeWarning?: boolean;
  /** Current agent EVM signer reported by the local agent service. */
  agentEvmAddress?: string | null;
  /** Multi-listing targets forwarded from the renter page. */
  targets?: StoredListing[];
}) {
  const [mandateInput, setMandateInput] = useState(mandateId);
  const [stage, setStage] = useState<Stage | null>(null);
  const [runRecord, setRunRecord] = useState<RunRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packetMissing, setPacketMissing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync when the parent resolves the mandate (e.g. after localStorage read).
  useEffect(() => {
    setMandateInput(mandateId);
  }, [mandateId]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function startRun() {
    setError(null);
    setPacketMissing(false);
    setRunRecord(null);
    setStage("loading-mandate");
    setBusy(true);

    try {
      if (!agentEvmAddress) {
        throw new Error("Agent has no EVM signer configured.");
      }

      const rentDelegate = createRentDelegateClient({
        network: "testnet",
        rpcUrl: RPC_URL_TESTNET,
        packageId: PACKAGE_ID,
      });
      const mandate = await rentDelegate.getMandate(mandateInput);
      if (mandate.agentEvm?.toLowerCase() !== agentEvmAddress.toLowerCase()) {
        demoSession.clearMandate();
        demoSession.clearPacket();
        setMandateInput("");
        throw new Error(
          `MANDATE_EVM_MISMATCH: mandate agent_evm ${mandate.agentEvm ?? "null"} does not match current agent EVM ${agentEvmAddress}`,
        );
      }

      // Preflight. The agent needs a packet registered for this mandate, and without
      // this check its absence surfaces four stages later as an opaque run failure.
      const packetRes = await fetch(
        `${PROVIDER_API}/packets/${encodeURIComponent(mandateInput)}`,
      );
      if (packetRes.status === 404) {
        setPacketMissing(true);
        throw new Error("No packet is registered for this mandate.");
      }

      // Build the run body: use targets if provided, else fall back to listingObjectId
      // or plain mandateId (agent chooses listing from provider default).
      const runBody: Record<string, unknown> = { mandateId: mandateInput };
      if (targets && targets.length > 0) {
        runBody.targets = targets;
      } else if (listingObjectId) {
        runBody.listingObjectId = listingObjectId;
      }

      const res = await fetch(`${AGENT_API}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runBody),
      });

      if (!res.ok) {
        throw new Error(`Agent returned ${res.status}`);
      }

      const { runId } = (await res.json()) as { runId: string };

      // Poll every 2 seconds
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${AGENT_API}/runs/${runId}`);
          if (!pollRes.ok) return;

          const record = (await pollRes.json()) as RunRecord;
          setRunRecord(record);

          if (record.status === "done" || record.status === "failed") {
            stopPolling();
            setBusy(false);
            if (record.result) {
              setStage(record.result.status === "complete" ? "complete" : "evaluating");
            }
          } else {
            // Advance stage indicator while running
            setStage((prev) => {
              const idx = prev ? ALL_STAGES.indexOf(prev) : 0;
              const next = ALL_STAGES[Math.min(idx + 1, ALL_STAGES.length - 2)];
              return next ?? prev;
            });
          }
        } catch {
          // ignore transient poll errors
        }
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setBusy(false);
      setStage(null);
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  const result = runRecord?.result;
  const noMandate = mandateInput.trim() === "";
  const agentIdentityLoading = agentEvmAddress === undefined;
  const evmMismatchError = isMandateEvmMismatch(error) || isMandateEvmMismatch(runRecord?.error);

  return (
    <section
      style={{
        marginBottom: "2rem",
        padding: "1rem",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {description && <p style={{ color: "#64748b", fontSize: "0.9rem" }}>{description}</p>}

      {smokeWarning && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            background: "#fef3c7",
            border: "1px solid #f0c040",
            borderRadius: 4,
            fontSize: "0.8rem",
            color: "#92400e",
            marginBottom: "0.75rem",
          }}
        >
          Archived smoke mandate — <code>agent_evm</code> is <code>null</code> and will fail{" "}
          <code>MANDATE_EVM_MISMATCH</code> on the live provider. Use for on-chain inspection only.
        </div>
      )}

      <div style={{ marginBottom: "0.75rem" }}>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
          Mandate ID
          {mandateSource && (
            <span
              style={{
                marginLeft: "0.5rem",
                padding: "0.1rem 0.4rem",
                borderRadius: 3,
                fontSize: "0.75rem",
                background: "#dbeafe",
                color: "#1e40af",
              }}
            >
              {mandateSource}
            </span>
          )}
        </label>
        <input
          value={mandateInput}
          onChange={(e) => setMandateInput(e.target.value)}
          disabled={busy}
          placeholder="0x… paste mandate ID or create one on the Renter page"
          style={{
            width: "100%",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            padding: "0.4rem",
            border: "1px solid #cbd5e1",
            borderRadius: 4,
            boxSizing: "border-box",
          }}
        />
      </div>

      {listingObjectId && (
        <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.75rem" }}>
          Listing:{" "}
          <a href={EXPLORER_OBJECT(listingObjectId)} target="_blank" rel="noreferrer">
            <code>{listingObjectId.slice(0, 20)}…</code>
          </a>
        </p>
      )}

      {noMandate ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 0.5rem" }}>
          No active mandate.{" "}
          <a href="/renter">Create a mandate on the Renter page</a> and upload a packet, then
          return here — the mandate will be auto-filled.
        </p>
      ) : (
        <button
          onClick={startRun}
          disabled={busy || agentIdentityLoading}
          style={{
            padding: "0.5rem 1rem",
            background: busy || agentIdentityLoading ? "#94a3b8" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: busy || agentIdentityLoading ? "default" : "pointer",
            fontSize: "inherit",
          }}
        >
          {busy ? "Running…" : agentIdentityLoading ? "Connecting agent…" : "Start run"}
        </button>
      )}

      {error && !evmMismatchError && (
        <p role="alert" style={{ color: "#dc2626", marginTop: 8 }}>
          {error}
          {packetMissing && (
            <>
              {" "}
              <a href={`/renter?mandateId=${encodeURIComponent(mandateInput)}`}>
                Upload one on the Renter page
              </a>
              , then come back.
            </>
          )}
        </p>
      )}

      {evmMismatchError && (
        <p role="alert" style={{ color: "#dc2626", marginTop: 8 }}>
          <strong>Mandate EVM mismatch.</strong> This mandate was not created for the current
          agent EVM signer. Create a fresh mandate on the{" "}
          <a href="/renter">Renter page</a> after confirming the agent identity, upload a packet,
          and return here.
        </p>
      )}

      {stage && <StageList currentStage={stage} />}

      {result && <ResultPanel result={result} />}
      {runRecord?.status === "failed" && !result && (
        <p style={{ color: "#dc2626", marginTop: "0.5rem" }}>
          Run failed: {runRecord.error}
        </p>
      )}
    </section>
  );
}

/** Mandate source → human-readable label shown next to the mandate input. */
type MandateSource = "url" | "packet" | "mandate" | "none";

const SOURCE_LABELS: Record<MandateSource, string> = {
  url: "from packet upload link",
  packet: "from recent packet upload",
  mandate: "from recent mandate",
  none: "",
};

export default function AgentPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [activeMandateId, setActiveMandateId] = useState<string>("");
  const [mandateSource, setMandateSource] = useState<MandateSource>("none");
  const [selectedListings, setSelectedListings] = useState<StoredListing[]>([]);

  useEffect(() => {
    fetch(`${AGENT_API}/health`)
      .then((r) => r.json())
      .then((data) => setHealth(data as HealthResponse))
      .catch((err) => setHealthError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Resolve active mandate using the priority order specified in RD-167:
  //   1. URL ?mandateId
  //   2. localStorage rentdelegate:lastPacketMandateId
  //   3. localStorage rentdelegate:lastMandateId
  //   4. none (Start disabled)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("mandateId");
    const fromPacket = demoSession.getLastPacketMandateId();
    const fromMandate = demoSession.getLastMandateId();

    if (fromUrl) {
      setActiveMandateId(fromUrl);
      setMandateSource("url");
    } else if (fromPacket) {
      setActiveMandateId(fromPacket);
      setMandateSource("packet");
    } else if (fromMandate) {
      setActiveMandateId(fromMandate);
      setMandateSource("mandate");
    } else {
      setActiveMandateId("");
      setMandateSource("none");
    }

    // Load selected listings saved from the renter page.
    setSelectedListings(demoSession.loadListings());
  }, []);

  return (
    <main style={{ maxWidth: 700, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Agent Operator</h1>
      <p style={{ color: "#64748b" }}>
        Trigger the RentDelegate agent from the browser. The agent loads the mandate on-chain,
        evaluates listing eligibility, encrypts and uploads the packet, reserves and submits the
        application on Sui, and verifies the receipt with the provider.
      </p>

      {/* Health status */}
      <div
        style={{
          marginBottom: "1.5rem",
          padding: "0.75rem 1rem",
          background: health ? "#f0fdf4" : healthError ? "#fef2f2" : "#f8fafc",
          border: `1px solid ${health ? "#86efac" : healthError ? "#fca5a5" : "#e2e8f0"}`,
          borderRadius: 6,
          fontSize: "0.9rem",
        }}
      >
        {health ? (
          <>
            <strong>Agent online</strong> — {health.agentSuiAddress.slice(0, 16)}…{" "}
            <span style={{ color: "#64748b" }}>agentkit: {health.agentkitMode}</span>
          </>
        ) : healthError ? (
          <span style={{ color: "#dc2626" }}>Agent offline: {healthError}</span>
        ) : (
          <span style={{ color: "#94a3b8" }}>Connecting to agent…</span>
        )}
      </div>

      {/* Selected listings display (from renter page handoff) */}
      {selectedListings.length > 0 && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.5rem 0.75rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <strong>Targets:</strong>{" "}
          <span>{selectedListings.map((t) => t.providerListingId).join(", ")}</span>
          <button
            onClick={() => {
              demoSession.clearListings();
              setSelectedListings([]);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#2563eb",
              cursor: "pointer",
              fontSize: "0.9rem",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            [clear]
          </button>
        </div>
      )}

      {/* Live eligible listing run — mandate from URL/localStorage, no smoke default */}
      <RunSection
        title="Run: Eligible listing (Lisbon)"
        mandateId={activeMandateId}
        targets={selectedListings.length > 0 ? selectedListings : undefined}
        agentEvmAddress={health?.agentEvmAddress}
        mandateSource={mandateSource !== "none" ? SOURCE_LABELS[mandateSource] : undefined}
        description="Evaluates listing eligibility, uploads packet, reserves and submits application on Sui."
      />

      {/* ── Archived evidence ── */}
      <details style={{ marginTop: "1rem" }}>
        <summary
          style={{ cursor: "pointer", color: "#64748b", fontSize: "0.9rem", fontWeight: 600 }}
        >
          Archived evidence (smoke runs)
        </summary>
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem",
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            background: "#f8fafc",
          }}
        >
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
            The runs below use archived smoke mandate objects whose <code>agent_evm</code> is{" "}
            <code>null</code>. They are retained as historical evidence of the eligible/ineligible
            path logic. They will be rejected by the live provider with{" "}
            <code>MANDATE_EVM_MISMATCH</code> — use them only to inspect on-chain state or to
            exercise the ineligibility proof.
          </p>

          {/* Smoke eligible listing */}
          <RunSection
            title="Smoke run: Eligible listing (Lisbon)"
            mandateId={SMOKE.mandateId}
            agentEvmAddress={health?.agentEvmAddress}
            mandateSource="archived smoke"
            description="Archived smoke mandate + eligible Lisbon listing. Expected status: complete (if provider accepts stale mandate) or MANDATE_EVM_MISMATCH."
            smokeWarning
          />

          {/* Ineligible listing proof */}
          <RunSection
            title="Smoke run: Ineligible listing proof (Porto)"
            mandateId={SMOKE.mandateId}
            listingObjectId={INELIGIBLE_LISTING_OBJECT_ID}
            agentEvmAddress={health?.agentEvmAddress}
            mandateSource="archived smoke"
            description="Porto listing triggers EMUNICIPALITY_NOT_ALLOWED. Expected status: ineligible."
            smokeWarning
          />
        </div>
      </details>
    </main>
  );
}
