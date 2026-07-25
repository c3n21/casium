"use client";

import { useState } from "react";
import { ListingForm } from "@/components/ListingForm";
import { ApplicationInbox } from "@/components/ApplicationInbox";

const DEMO_APPLICATION_IDS = ["app_1"];

export default function ProviderPage() {
  const [applicationIds, setApplicationIds] = useState<string[]>(DEMO_APPLICATION_IDS);
  const [showForm, setShowForm] = useState(false);
  const [createdTx, setCreatedTx] = useState<string | null>(null);

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Provider Dashboard</h1>
      <p style={{ color: "#64748b" }}>
        Create listings, review applications with AgentKit uniqueness proof, and verify Sui receipts.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Listings</h2>
          <button onClick={() => setShowForm((v) => !v)} style={secondaryBtn}>
            {showForm ? "Close" : "+ New listing"}
          </button>
        </div>

        {showForm && (
          <div style={{ marginTop: "1rem" }}>
            <ListingForm onCreated={(_id, tx) => { setCreatedTx(tx); setShowForm(false); }} />
          </div>
        )}

        {createdTx && (
          <p style={{ marginTop: 8 }}>
            ✅ Listing created. <a href={`https://suivision.xyz/txblock/${createdTx}?network=testnet`} target="_blank" rel="noreferrer">View tx</a>
          </p>
        )}

        <div style={{ marginTop: "1rem", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {["ID", "Object", "Municipality", "Rent", "Bedrooms", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}>listing_lisbon_eligible</td>
                <td style={td}><a href="https://suivision.xyz/object/0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a?network=testnet" target="_blank" rel="noreferrer"><code>0xe7f6…</code></a></td>
                <td style={td}>Lisbon</td>
                <td style={td}>€1700</td>
                <td style={td}>2</td>
                <td style={td}><span style={{ color: "#16a34a" }}>Active</span></td>
              </tr>
              <tr>
                <td style={td}>listing_porto_ineligible</td>
                <td style={td}><code style={{ color: "#94a3b8" }}>0x1000…</code></td>
                <td style={td}>Porto (demo)</td>
                <td style={td}>€1200</td>
                <td style={td}>2</td>
                <td style={td}><span style={{ color: "#f59e0b" }}>Ineligible</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Applications</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 0 }}>
          Each application shows World AgentKit human hash (uniqueness proof) and Sui receipt verification.
        </p>
        <ApplicationInbox applicationIds={applicationIds} />

        <div style={{ marginTop: "1rem" }}>
          <input
            type="text"
            placeholder="Add application ID (e.g. app_2)"
            style={{ padding: "0.4rem 0.5rem", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: "inherit", marginRight: 8 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value) {
                setApplicationIds((ids) => [...new Set([...ids, e.currentTarget.value])]);
                e.currentTarget.value = "";
              }
            }}
          />
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Press Enter to add</span>
        </div>
      </section>
    </main>
  );
}

const secondaryBtn: React.CSSProperties = { padding: "0.5rem 1rem", border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: "inherit" };
const td: React.CSSProperties = { padding: "0.6rem 0.75rem", borderBottom: "1px solid #e2e8f0" };
