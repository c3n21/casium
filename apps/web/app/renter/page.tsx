"use client";

import { useState } from "react";
import { MandateForm } from "@/components/MandateForm";
import { MandateStatus } from "@/components/MandateStatus";
import { RevokeButton } from "@/components/RevokeButton";
import { PacketBuilder } from "@/components/PacketBuilder";

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
    mandateId: "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee",
    ownerCapId: "0xcdb3924e29345c3be077f3c54de78435144ad141d0458a93f6fb6ae0381a571d",
    agentCapId: "0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a",
    txDigest: "ANNzWCc4StQWGnbdDKmxkwozYhk2V8CDVDUk4UA1sfDA",
  };

  const active = mandate ?? smokeMandate;

  return (
    <main style={{ maxWidth: 680, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Renter Dashboard</h1>
      <p style={{ color: "#64748b" }}>
        Create a mandate scoped to your requirements. Your agent will only be able to apply within these limits.
      </p>

      {!mandate && <MandateForm onCreated={(id, tx) => setMandate({ mandateId: id, ownerCapId: "", agentCapId: "", txDigest: tx })} />}

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
