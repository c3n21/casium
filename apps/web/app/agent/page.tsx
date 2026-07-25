"use client";

import { useState, useEffect, useRef } from "react";
import {
  SMOKE,
  INELIGIBLE_LISTING_OBJECT_ID,
  EXPLORER_TX,
  EXPLORER_OBJECT,
} from "@rentdelegate/contracts-config";
import { AGENT_API } from "@/lib/agentApi";
const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

type HealthResponse = {
  ok: boolean;
  service: string;
  agentSuiAddress: string;
  agentkitMode: string;
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
        const pending = currentIdx < i;
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

function ResultPanel({ result }: { result: RunResult }) {
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
      {result.reason && (
        <p style={{ margin: "0 0 0.5rem", color: "#92400e" }}>
          Reason: {result.reason}
        </p>
      )}
      {result.error && (
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
        <p style={{ margin: 0 }}>
          Blob ID: <code>{result.blobId}</code>
        </p>
      )}
    </div>
  );
}

function RunSection({
  title,
  mandateId,
  listingObjectId,
  description,
  acceptQueryMandate,
}: {
  title: string;
  mandateId: string;
  listingObjectId?: string;
  description?: string;
  /** Pre-fill from `?mandateId=`, so the renter arrives from the packet upload ready to run. */
  acceptQueryMandate?: boolean;
}) {
  const [mandateInput, setMandateInput] = useState(mandateId);
  const [stage, setStage] = useState<Stage | null>(null);
  const [runRecord, setRunRecord] = useState<RunRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packetMissing, setPacketMissing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read the query param directly rather than via useSearchParams, which would force
  // this whole page behind a Suspense boundary for a single optional prefill.
  useEffect(() => {
    if (!acceptQueryMandate) return;
    const fromQuery = new URLSearchParams(window.location.search).get("mandateId");
    if (fromQuery) setMandateInput(fromQuery);
  }, [acceptQueryMandate]);

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
      // Preflight. The agent needs a packet registered for this mandate, and without
      // this check its absence surfaces four stages later as an opaque run failure.
      const packetRes = await fetch(
        `${PROVIDER_API}/packets/${encodeURIComponent(mandateInput)}`,
      );
      if (packetRes.status === 404) {
        setPacketMissing(true);
        throw new Error("No packet is registered for this mandate.");
      }

      const res = await fetch(`${AGENT_API}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mandateId: mandateInput,
          ...(listingObjectId ? { listingObjectId } : {}),
        }),
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
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setStage(null);
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  const result = runRecord?.result;

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

      <div style={{ marginBottom: "0.75rem" }}>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
          Mandate ID
        </label>
        <input
          value={mandateInput}
          onChange={(e) => setMandateInput(e.target.value)}
          disabled={busy}
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

      <button
        onClick={startRun}
        disabled={busy}
        style={{
          padding: "0.5rem 1rem",
          background: busy ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: busy ? "default" : "pointer",
          fontSize: "inherit",
        }}
      >
        {busy ? "Running…" : "Start run"}
      </button>

      {error && (
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

export default function AgentPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${AGENT_API}/health`)
      .then((r) => r.json())
      .then((data) => setHealth(data as HealthResponse))
      .catch((err) => setHealthError(err instanceof Error ? err.message : String(err)));
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

      {/* Eligible listing run */}
      <RunSection
        title="Run: Eligible listing (Lisbon)"
        mandateId={SMOKE.mandateId}
        description="Uses the smoke mandate and eligible Lisbon listing. Expect status: complete."
        acceptQueryMandate
      />

      {/* Ineligible listing proof */}
      <RunSection
        title="Ineligible listing proof (Porto)"
        mandateId={SMOKE.mandateId}
        listingObjectId={INELIGIBLE_LISTING_OBJECT_ID}
        description="Porto listing triggers EMUNICIPALITY_NOT_ALLOWED. Expect status: ineligible."
      />
    </main>
  );
}
