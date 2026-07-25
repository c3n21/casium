"use client";

import { useState } from "react";
import { MandateForm } from "@/components/MandateForm";
import { MandateStatus } from "@/components/MandateStatus";
import { RevokeButton } from "@/components/RevokeButton";
import { PacketBuilder } from "@/components/PacketBuilder";
import { SMOKE } from "@rentdelegate/contracts-config";

type MandateRecord = {
  mandateId: string;
  ownerCapId: string;
  agentCapId: string;
  txDigest: string;
};

export default function RenterPage() {
  const [mandate, setMandate] = useState<MandateRecord | null>(null);
  const [revoked, setRevoked] = useState(false);

  const smokeMandate: MandateRecord = {
    mandateId: SMOKE.mandateId,
    ownerCapId: SMOKE.ownerCapId,
    agentCapId: SMOKE.agentCapId,
    txDigest: SMOKE.createMandateTxDigest,
  };

  const active = mandate ?? smokeMandate;

  return (
    <main style={{ maxWidth: 680, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Renter Dashboard</h1>
      <p style={{ color: "#64748b" }}>
        Create a mandate scoped to your requirements. Your agent will only be able to apply within these limits.
      </p>

      {!mandate && <MandateForm onCreated={setMandate} />}

      <MandateStatus
        mandateId={active.mandateId}
        ownerCapId={active.ownerCapId}
        agentCapId={active.agentCapId}
        createTxDigest={active.txDigest}
      />

      {active.ownerCapId && !revoked && (
        <RevokeButton
          mandateId={active.mandateId}
          ownerCapId={active.ownerCapId}
          onRevoked={() => setRevoked(true)}
        />
      )}

      <hr style={{ margin: "2rem 0", borderColor: "#e2e8f0" }} />

      <h2>Upload Application Packet</h2>
      <p style={{ color: "#64748b" }}>Encrypt your synthetic document packet before the agent submits it.</p>
      <PacketBuilder />
    </main>
  );
}
