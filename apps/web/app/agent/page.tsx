"use client";

import { useState, useEffect, useRef } from "react";
import {
  SMOKE,
  INELIGIBLE_LISTING_OBJECT_ID,
  EXPLORER_TX,
  EXPLORER_OBJECT,
} from "@casium/contracts-config";
import { createCasiumClient } from "@casium/sui-client";
import { AGENT_API } from "@/lib/agentApi";
import { PACKAGE_ID, RPC_URL_TESTNET } from "@/lib/constants";
import { demoSession, type StoredListing } from "@/lib/demoSession";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const PROVIDER_API = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";
const E2E_STUB_SUI = process.env.NEXT_PUBLIC_E2E_STUB_SUI === "1";

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
    <ol className="list-none p-0 my-4 grid gap-2">
      {ALL_STAGES.map((stage, i) => {
        const done = currentIdx > i;
        const active = currentIdx === i;
        return (
          <li
            key={stage}
            className={`border border-solid border-line rounded-[14px] bg-white/50 px-3 py-2.5 font-[750] ${done ? "text-mint" : active ? "text-blue" : "text-faint"}`}
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

/** Human-facing name for a target, falling back to the internal provider key. */
function listingLabel(listing: StoredListing): string {
  return listing.externalListingId ?? listing.providerListingId;
}

/**
 * Title for the live run section. Naming the actual selection matters: a run
 * targeting `porto-demo-1` under a hardcoded "Eligible listing (Lisbon)" heading
 * reads as if the wrong listing were about to be applied to.
 */
function runTitle(targets: StoredListing[]): string {
  if (targets.length === 0) return "Run: Eligible listing (Lisbon)";
  if (targets.length > 3) return `Run: ${targets.length} selected listings`;
  return `Run: ${targets.map(listingLabel).join(", ")}`;
}

function ResultPanel({
  result,
  labels,
}: {
  result: RunResult;
  /** providerListingId → human-facing listing ID, for per-target rows. */
  labels: Map<string, string>;
}) {
  const evmMismatch =
    isMandateEvmMismatch(result.error) || isMandateEvmMismatch(result.reason);

  return (
    <Alert
      variant={result.status === "complete" ? "success" : result.status === "ineligible" ? "warn" : "error"}
      className="mt-4"
      data-testid="run-results"
    >
      <p className="mx-0 mt-0 mb-2 font-semibold" data-testid="run-status" data-status={result.status}>
        Status: {result.status}
      </p>
      {result.reason && !evmMismatch && (
        <p className="mx-0 mt-0 mb-2 text-amber">
          Reason: {result.reason}
        </p>
      )}
      {evmMismatch && (
        <p className="mx-0 mt-0 mb-2 text-red">
          <strong>Mandate EVM mismatch.</strong> This mandate was not created for the current
          agent EVM signer — its <code>agent_evm</code> does not match the verified World
          identity. Create a fresh mandate on the{" "}
          <a href="/renter">Renter page</a> after confirming the agent identity, then upload a
          packet and return here.
        </p>
      )}
      {result.error && !evmMismatch && (
        <p className="mx-0 mt-0 mb-2 text-red">
          Error: {result.error}
        </p>
      )}
      {result.txDigest && (
        <p className="mx-0 mt-0 mb-1">
          Tx:{" "}
          <a href={EXPLORER_TX(result.txDigest)} target="_blank" rel="noreferrer">
            <code>{result.txDigest.slice(0, 20)}…</code>
          </a>
        </p>
      )}
      {result.receiptId && (
        <p className="mx-0 mt-0 mb-1">
          Receipt:{" "}
          <a href={EXPLORER_OBJECT(result.receiptId)} target="_blank" rel="noreferrer">
            <code>{result.receiptId.slice(0, 20)}…</code>
          </a>
        </p>
      )}
      {result.applicationId && (
        <p className="mx-0 mt-0 mb-1">
          Application ID: <code>{result.applicationId}</code>
        </p>
      )}
      {result.blobId && (
        <p className={result.targets && result.targets.length > 0 ? "mx-0 mt-0 mb-2" : "m-0"}>
          Blob ID: <code>{result.blobId}</code>
        </p>
      )}
      {result.targets && result.targets.length > 0 && (
        <div className="mt-2">
          <p className="mx-0 mt-0 mb-1.5 font-semibold">Per-listing results:</p>
          {result.targets.map((t) => (
            <div
              key={t.providerListingId}
              className="py-[0.4rem] px-[0.6rem] mb-1 bg-white/60 rounded text-sm"
            >
              <code>{labels.get(t.providerListingId) ?? t.providerListingId}</code> — {t.status}
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
    </Alert>
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

      const mandate = E2E_STUB_SUI
        ? { agentEvm: agentEvmAddress }
        : await createCasiumClient({
            network: "testnet",
            rpcUrl: RPC_URL_TESTNET,
            packageId: PACKAGE_ID,
          }).getMandate(mandateInput);
      if (mandate.agentEvm?.toLowerCase() !== agentEvmAddress.toLowerCase()) {
        demoSession.clearMandate();
        demoSession.clearPacket();
        setMandateInput("");
        throw new Error(
          `MANDATE_EVM_MISMATCH: mandate agent_evm ${mandate.agentEvm ?? "null"} does not match current agent EVM ${agentEvmAddress}`,
        );
      }

      // Preflight. The agent needs one packet per selected target; otherwise its
      // absence surfaces four stages later as an opaque run failure.
      if (targets && targets.length > 0) {
        const packetRes = await fetch(
          `${PROVIDER_API}/packets/by-mandate/${encodeURIComponent(mandateInput)}`,
        );
        if (packetRes.status === 404) {
          setPacketMissing(true);
          throw new Error("No packet is registered for this mandate.");
        }
        if (!packetRes.ok) throw new Error(`Packet lookup returned ${packetRes.status}`);

        const { packets } = (await packetRes.json()) as {
          packets?: Array<{ providerListingId: string }>;
        };
        const packetListingIds = new Set((packets ?? []).map((packet) => packet.providerListingId));
        const missingTarget = targets.find((target) => !packetListingIds.has(target.providerListingId));
        if (missingTarget) {
          setPacketMissing(true);
          throw new Error(`No packet is registered for target ${listingLabel(missingTarget)}.`);
        }
      } else {
        const packetRes = await fetch(
          `${PROVIDER_API}/packets/${encodeURIComponent(mandateInput)}`,
        );
        if (packetRes.status === 404) {
          setPacketMissing(true);
          throw new Error("No packet is registered for this mandate.");
        }
        if (!packetRes.ok) throw new Error(`Packet lookup returned ${packetRes.status}`);
      }

      // Build the run body: use targets if provided, else fall back to listingObjectId
      // or plain mandateId (agent chooses listing from provider default).
      const runBody: Record<string, unknown> = { mandateId: mandateInput };
      if (targets && targets.length > 0) {
        // Send only the wire shape — externalListingId is a display-side concern.
        runBody.targets = targets.map(({ providerListingId, listingObjectId: objectId }) => ({
          providerListingId,
          listingObjectId: objectId,
        }));
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
  const targetLabels = new Map((targets ?? []).map((t) => [t.providerListingId, listingLabel(t)]));
  const noMandate = mandateInput.trim() === "";
  const agentIdentityLoading = agentEvmAddress === undefined;
  const evmMismatchError = isMandateEvmMismatch(error) || isMandateEvmMismatch(runRecord?.error);

  return (
    <Card
      className="mb-8"
      data-testid={title.startsWith("Smoke") ? undefined : "active-run-section"}
    >
      <div>
      <h3>{title}</h3>
      {description && <p className="text-muted-ink text-[0.9rem]">{description}</p>}

      {smokeWarning && (
        <Alert variant="warn" className="text-[0.8rem] mb-3">
          Archived smoke mandate — <code>agent_evm</code> is <code>null</code> and will fail{" "}
          <code>MANDATE_EVM_MISMATCH</code> on the live provider. Use for on-chain inspection only.
        </Alert>
      )}

      <div className="mb-3">
        <label className="block text-[0.85rem] mb-1">
          Mandate ID
          {mandateSource && (
            <Badge variant="info" className="ml-2">
              {mandateSource}
            </Badge>
          )}
        </label>
        <input
          value={mandateInput}
          onChange={(e) => setMandateInput(e.target.value)}
          disabled={busy}
          placeholder="0x… paste mandate ID or create one on the Renter page"
          className="font-mono! text-[0.8rem]!"
        />
      </div>

      {listingObjectId && (
        <p className="text-[0.85rem] text-muted-ink mx-0 mt-0 mb-3">
          Listing:{" "}
          <a href={EXPLORER_OBJECT(listingObjectId)} target="_blank" rel="noreferrer">
            <code>{listingObjectId.slice(0, 20)}…</code>
          </a>
        </p>
      )}

      {noMandate ? (
        <p className="muted text-[0.9rem] mx-0 mt-0 mb-2" data-testid="no-mandate-empty">
          No active mandate.{" "}
          <a href="/renter">Create a mandate on the Renter page</a> and upload a packet, then
          return here — the mandate will be auto-filled.
        </p>
      ) : (
        <button
          onClick={startRun}
          disabled={busy || agentIdentityLoading}
            data-testid="agent-start-run-button"
            data-ui="button"
        >
          {busy ? "Running…" : agentIdentityLoading ? "Connecting agent…" : "Start run"}
        </button>
      )}

      {error && !evmMismatchError && (
        <Alert variant="error" className="mt-2" data-testid="run-error-alert">
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
        </Alert>
      )}

      {evmMismatchError && (
        <Alert
          variant="error"
          className="mt-2"
          data-testid="run-error-alert"
          data-error-code="MANDATE_EVM_MISMATCH"
        >
          <strong>Mandate EVM mismatch.</strong> This mandate was not created for the current
          agent EVM signer. Create a fresh mandate on the{" "}
          <a href="/renter">Renter page</a> after confirming the agent identity, upload a packet,
          and return here.
        </Alert>
      )}

      {stage && <StageList currentStage={stage} />}

      {result && <ResultPanel result={result} labels={targetLabels} />}
      {runRecord?.status === "failed" && !result && (
        <p className="text-red mt-2">
          Run failed: {runRecord.error}
        </p>
      )}
      </div>
    </Card>
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
  //   2. localStorage casium:lastPacketMandateId
  //   3. localStorage casium:lastMandateId
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
    <main className="page narrow">
      <p className="eyebrow">Autonomous execution</p>
      <h1 className="page-title">Agent Run</h1>
      <p className="lede">
        Trigger the Casium agent from the browser. The agent loads the mandate on-chain,
        evaluates listing eligibility, encrypts and uploads the packet, reserves and submits the
        application on Sui, and verifies the receipt with the provider.
      </p>

      {/* Health status */}
      <Alert
        variant={health ? "success" : healthError ? "error" : "default"}
        className="mb-6 text-[0.9rem]"
        data-testid="agent-health-status"
      >
        {health ? (
          <>
            <strong>Agent online</strong> — {health.agentSuiAddress.slice(0, 16)}…{" "}
            <span className="muted" data-testid="agentkit-mode">agentkit: {health.agentkitMode}</span>
          </>
        ) : healthError ? (
          <span className="text-red">Agent offline: {healthError}</span>
        ) : (
          <span className="text-faint">Connecting to agent…</span>
        )}
      </Alert>

      {/* Selected listings display (from renter page handoff) */}
      {selectedListings.length > 0 && (
        <Alert className="cluster mb-4 text-[0.9rem]">
          <strong>Targets:</strong>{" "}
          <span>{selectedListings.map(listingLabel).join(", ")}</span>
          <button
            onClick={() => {
              demoSession.clearListings();
              setSelectedListings([]);
            }}
            className="bg-transparent border-0 text-blue cursor-pointer text-[0.9rem] underline p-0"
          >
            [clear]
          </button>
        </Alert>
      )}

      {/* Live run — mandate from URL/localStorage, listings from the renter handoff */}
      <RunSection
        title={runTitle(selectedListings)}
        mandateId={activeMandateId}
        targets={selectedListings.length > 0 ? selectedListings : undefined}
        agentEvmAddress={health?.agentEvmAddress}
        mandateSource={mandateSource !== "none" ? SOURCE_LABELS[mandateSource] : undefined}
        description={
          selectedListings.length > 0
            ? "Evaluates each selected listing and applies only where eligible; uploads packet, reserves and submits on Sui."
            : "Evaluates listing eligibility, uploads packet, reserves and submits application on Sui."
        }
      />

      {/* ── Archived evidence ── */}
      <details
        className="mt-4 border border-solid border-line rounded-[var(--radius)] bg-[rgba(246,239,225,0.72)] shadow-none p-4"
        data-testid="developer-evidence"
      >
        <summary
          className="text-[0.9rem]"
        >
          Archived evidence (smoke runs)
        </summary>
        <div
          className="mt-3 p-3 border border-solid border-line rounded bg-paper-2"
        >
          <p className="mx-0 mt-0 mb-4 text-[0.85rem] text-muted-ink">
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
