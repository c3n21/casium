"use client";

import { useState } from "react";
import { EXPLORER_TX, EXPLORER_OBJECT } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PROVIDER_API_BASE = process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? "http://localhost:4021";

export type ReservedApplication = {
  id: string;
  listingId: string;
  listingObjectId: string;
  providerSuiAddress: string;
  landlordSuiAddress: string;
  mandateId: string;
  agentSuiAddress: string;
  agentEvmAddress: string;
  humanIdHash: string;
  walrusBlobId: string;
  packetHash: string;
  status: "reserved" | "accepted" | "withdrawn";
  idempotencyKey: string;
  receipt?: {
    receiptId: string;
    txDigest: string;
    mandateId: string;
    listingObjectId: string;
    submittedAtMs: number;
    accessExpiresAtMs: number;
  };
};

type ApplicationInboxProps = {
  role: "provider" | "landlord";
  applications: ReservedApplication[];
  onRefetch?: () => void;
  /**
   * Optional per-row slot rendered under the receipt line (RD-184). The landlord
   * page passes `ApplicationPacketAccess` here. Kept as a render prop so this
   * component stays free of Sui, Seal, and Walrus imports — `/provider` renders
   * the same rows without pulling the decrypt path into its bundle.
   */
  renderPacketAccess?: (application: ReservedApplication) => React.ReactNode;
};

export function ApplicationInbox({
  role,
  applications,
  onRefetch,
  renderPacketAccess,
}: ApplicationInboxProps) {
  const [verifyInputs, setVerifyInputs] = useState<Record<string, { txDigest: string; receiptId: string }>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});

  async function handleVerify(appId: string) {
    const input = verifyInputs[appId];
    if (!input?.txDigest || !input?.receiptId) return;
    setVerifying(appId);
    setVerifyErrors((e) => ({ ...e, [appId]: "" }));

    try {
      const res = await fetch(`${PROVIDER_API_BASE}/applications/${appId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: appId, txDigest: input.txDigest, receiptId: input.receiptId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        setVerifyErrors((e) => ({ ...e, [appId]: body.error }));
      } else {
        onRefetch?.();
      }
    } catch (err) {
      setVerifyErrors((e) => ({ ...e, [appId]: err instanceof Error ? err.message : "Network error" }));
    } finally {
      setVerifying(null);
    }
  }

  if (applications.length === 0) {
    return <p className="muted" data-testid="applications-empty">No applications yet. The agent will populate this once it submits.</p>;
  }

  return (
    <div className="stack">
      {applications.map((a) => (
        // Card is flex column with a 20px gap between every top-level child; wrapping
        // in a single div keeps the original margin-driven rhythm (mt-2, mb-1, ...)
        // from being stacked on top of that gap.
        <Card key={a.id} data-testid={`application-card-${a.id}`}>
        <div>
          <div className="split mb-2">
            <strong className="font-mono text-sm">{a.id}</strong>
            <StatusBadge status={a.status} />
          </div>

          {a.mandateId && (
            <p className="mx-0 mt-0 mb-1 text-[0.85rem] text-muted-ink">
              Mandate:{" "}
              <a href={EXPLORER_OBJECT(a.mandateId)} target="_blank" rel="noreferrer">
                <code>{a.mandateId.slice(0, 16)}…</code>
              </a>{" "}
              | Blob: <code>{a.walrusBlobId.slice(0, 20)}…</code> | Human:{" "}
              <code>{a.humanIdHash.slice(0, 18)}…</code>
            </p>
          )}

          {role === "provider" && a.status === "reserved" && (
            <details className="mt-2">
              <summary data-testid="verify-receipt-summary">Verify Sui receipt</summary>
              <div className="mt-2 flex flex-col gap-2">
                <Input
                  type="text"
                  placeholder="tx digest"
                  data-testid="tx-digest-input"
                  value={verifyInputs[a.id]?.txDigest ?? ""}
                  onChange={(e) =>
                    setVerifyInputs((v) => ({ ...v, [a.id]: { ...v[a.id], txDigest: e.target.value } }))
                  }
                />
                <Input
                  type="text"
                  placeholder="receipt object ID (0x...)"
                  data-testid="receipt-id-input"
                  value={verifyInputs[a.id]?.receiptId ?? ""}
                  onChange={(e) =>
                    setVerifyInputs((v) => ({ ...v, [a.id]: { ...v[a.id], receiptId: e.target.value } }))
                  }
                />
                {verifyErrors[a.id] && (
                  <p className="m-0 text-[0.85rem] text-red">{verifyErrors[a.id]}</p>
                )}
                <Button onClick={() => handleVerify(a.id)} disabled={verifying === a.id}>
                  {verifying === a.id ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </details>
          )}

          {role === "landlord" && a.status === "reserved" && (
            <p className="muted mx-0 mt-2 mb-0 text-[0.85rem]" data-testid="landlord-awaiting-receipt">
              Awaiting on-chain receipt verification by the provider.
            </p>
          )}

          {a.receipt && (
            <p className="mx-0 mt-2 mb-0 text-[0.85rem]">
              ✅ Receipt:{" "}
              <a href={EXPLORER_OBJECT(a.receipt.receiptId)} target="_blank" rel="noreferrer">
                <code>{a.receipt.receiptId.slice(0, 16)}…</code>
              </a>{" "}
              ·{" "}
              <a href={EXPLORER_TX(a.receipt.txDigest)} target="_blank" rel="noreferrer">
                view tx
              </a>
            </p>
          )}

          {renderPacketAccess?.(a)}
        </div>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "accepted" ? "success" : status === "reserved" ? "warn" : "neutral"}
      data-testid="application-status"
      data-status={status}
    >
      {status}
    </Badge>
  );
}
