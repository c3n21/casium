"use client";

/**
 * PacketViewer — RD-136 Landlord SessionKey And Decryption UI
 *
 * Lets an authorized landlord decrypt a Seal-encrypted rental application
 * packet in the browser. The Move `seal_approve_packet` function acts as the
 * policy gate: key servers dry-run the PTB and only return decryption keys if
 * all six on-chain checks pass.
 *
 * Plaintext stays in memory. It is never logged, never sent to a server, and
 * is only rendered inside this component.
 */

import { useState, useEffect, useCallback } from "react";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { createSealClient, DEFAULT_THRESHOLD, SessionKey } from "@casium/seal";
import { deriveSealIdentity, identityToHex } from "@casium/shared";
import { LATEST_PACKAGE_ID, PACKAGE_ID } from "@casium/contracts-config";
import { createWalrusHttpAdapter } from "@casium/walrus/http";
import type { ApplicationReceipt } from "@casium/sui-client";
import type { PacketDocument } from "@casium/shared";
import { Transaction } from "@mysten/sui/transactions";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Browser Walrus adapter — mirrors PacketBuilder.tsx
// ---------------------------------------------------------------------------

function createBrowserWalrusAdapter() {
  const mode = process.env.NEXT_PUBLIC_WALRUS_MODE;
  if (mode === "http") return createWalrusHttpAdapter();
  // cli and mock modes: for viewing we can only use HTTP; mock blobs are
  // ephemeral and stored in the upload component's closure, not globally.
  // Return an HTTP adapter so real blobs work; mock blobs will fail with a
  // clear error.
  return createWalrusHttpAdapter();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DecryptStage =
  | { type: "idle" }
  | { type: "creating_session" }
  | { type: "signing" }
  | { type: "session_ready"; sessionKey: SessionKey; expiresAt: number }
  | { type: "decrypting"; sessionKey: SessionKey; expiresAt: number }
  | { type: "decrypted"; document: PacketDocument; sessionKey: SessionKey; expiresAt: number }
  | { type: "error"; message: string; abortCode?: string };

type PacketViewerProps = {
  receipt: ApplicationReceipt;
};

// Walrus epoch duration used for expiry estimate (matches ReceiptTable constant).
const WALRUS_EPOCH_DURATION_MS = 86_400_000;
const WALRUS_CONFIGURED_EPOCHS = Number(process.env["NEXT_PUBLIC_WALRUS_EPOCHS"] ?? 5);

// Clock object ID on Sui
const CLOCK_OBJECT_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";

/**
 * `seal_approve_packet` abort codes (packages/move/sources/rental.move:31-36).
 * A bare number tells the landlord nothing; the name says which of the six
 * policy checks refused them.
 */
const SEAL_ABORT_NAMES: Record<string, string> = {
  "17": "ESEAL_WRONG_SENDER — you are not the landlord named on this receipt",
  "18": "ESEAL_WRONG_IDENTITY — the Seal identity does not match this receipt",
  "19": "ESEAL_WRONG_STATUS — the application was withdrawn",
  "20": "ESEAL_EXPIRED_ACCESS — the on-chain access window has closed",
  "21": "ESEAL_WRONG_MANDATE — the supplied mandate is not the receipt's mandate",
  "22": "ESEAL_MANDATE_REVOKED — the renter revoked the mandate",
};

/**
 * Explain a key-server refusal from on-chain facts.
 *
 * Key servers return a generic "does not have access" error — they dry-run
 * `seal_approve_packet` themselves and never report which assert aborted. But
 * three of the six checks read fields of the receipt we already hold, so when
 * one of those is false we can name the abort as fact rather than as a guess.
 *
 * Returns null when every locally checkable condition passes — the refusal then
 * came from a check we cannot see (identity, mandate mismatch, or a revoked
 * mandate, which lives on a different object), and we must not invent a reason.
 */
function diagnosePolicyDenial(
  receipt: ApplicationReceipt,
  connectedAddress: string | null,
): { code: string; name: string } | null {
  if (
    connectedAddress !== null &&
    receipt.landlord.toLowerCase() !== connectedAddress.toLowerCase()
  ) {
    return { code: "17", name: SEAL_ABORT_NAMES["17"] as string };
  }
  if (receipt.status !== 1) {
    return { code: "19", name: SEAL_ABORT_NAMES["19"] as string };
  }
  if (Date.now() > receipt.accessExpiresAtMs) {
    return { code: "20", name: SEAL_ABORT_NAMES["20"] as string };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PacketViewer({ receipt }: PacketViewerProps) {
  const suiClient = useCurrentClient();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const [stage, setStage] = useState<DecryptStage>({ type: "idle" });
  const [ttlRemaining, setTtlRemaining] = useState<number | null>(null);

  // Decode blob ID from bytes
  const walrusBlobId =
    receipt.walrusBlobIdBytes.length > 0
      ? new TextDecoder().decode(new Uint8Array(receipt.walrusBlobIdBytes))
      : "";

  const isMockBlob = walrusBlobId.startsWith("mock:");
  const encryptionMode = process.env.NEXT_PUBLIC_ENCRYPTION_MODE ?? "mock";
  const useSeal = encryptionMode === "seal";

  // TTL countdown
  useEffect(() => {
    if (
      stage.type !== "session_ready" &&
      stage.type !== "decrypting" &&
      stage.type !== "decrypted"
    ) {
      setTtlRemaining(null);
      return;
    }
    const { expiresAt } = stage;
    const update = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTtlRemaining(remaining);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [stage]);

  // -----------------------------------------------------------------
  // Step 1: Request access — create a Seal SessionKey
  // -----------------------------------------------------------------
  const handleRequestAccess = useCallback(async () => {
    if (!account) return;
    setStage({ type: "creating_session" });

    try {
      // Seal namespace = original (v1) package ID. SessionKey.create enforces
      // this the same way SealClient.encrypt does, and it must match the
      // namespace the packet was encrypted under in PacketBuilder.
      const sessionKey = await SessionKey.create({
        address: account.address,
        packageId: PACKAGE_ID,
        ttlMin: 10,
        suiClient,
      });

      setStage({ type: "signing" });

      // Get the personal message to sign
      const message = sessionKey.getPersonalMessage();

      // Sign with the wallet
      const signed = await dAppKit.signPersonalMessage({ message });

      // Complete session key setup
      await sessionKey.setPersonalMessageSignature(signed.signature);

      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min TTL
      setStage({ type: "session_ready", sessionKey, expiresAt });
    } catch (err) {
      setStage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [account, suiClient, dAppKit]);

  // -----------------------------------------------------------------
  // Step 2: Decrypt the packet
  // -----------------------------------------------------------------
  const handleDecrypt = useCallback(async () => {
    if (stage.type !== "session_ready") return;
    const { sessionKey, expiresAt } = stage;

    setStage({ type: "decrypting", sessionKey, expiresAt });

    try {
      // 1. Derive the Seal inner identity: bcs(mandateId) || bcs(listingId)
      const sealIdentityBytes = deriveSealIdentity({
        mandateId: receipt.mandateId,
        listingObjectId: receipt.listingId,
      });
      const sealIdHex = identityToHex(sealIdentityBytes);

      // 2. Build the seal_approve_packet PTB (onlyTransactionKind: true)
      //    Key servers dry-run this to evaluate the access policy.
      //    This is the one place LATEST_PACKAGE_ID is correct: the function
      //    only exists in the v2 package. The Seal *namespace* stays on v1.
      const tx = new Transaction();
      tx.moveCall({
        target: `${LATEST_PACKAGE_ID}::rental::seal_approve_packet`,
        arguments: [
          tx.pure.vector("u8", Array.from(sealIdentityBytes)),
          tx.object(receipt.id),          // &ApplicationReceipt
          tx.object(receipt.mandateId),   // &RentalMandate
          tx.object(CLOCK_OBJECT_ID),     // &Clock
        ],
      });
      const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

      // 3. Create the Seal client (namespace = v1, matching encryption)
      const sealClientWrapper = createSealClient({
        suiClient,
        packageId: PACKAGE_ID,
        threshold: DEFAULT_THRESHOLD,
      });

      // 4. Fetch decryption keys from key servers (dry-runs the PTB)
      await sealClientWrapper.sealClient.fetchKeys({
        ids: [sealIdHex],
        txBytes,
        sessionKey,
        threshold: DEFAULT_THRESHOLD,
      });

      // 5. Download ciphertext from Walrus
      const walrus = createBrowserWalrusAdapter();
      const ciphertext = await walrus.download(walrusBlobId);

      // 6. Decrypt (uses the keys fetched in step 4 from cache)
      const plaintext = await sealClientWrapper.sealClient.decrypt({
        data: ciphertext,
        sessionKey,
        txBytes,
      });

      // 7. Decode — plaintext must stay in memory only
      const document = JSON.parse(new TextDecoder().decode(plaintext)) as PacketDocument;

      setStage({ type: "decrypted", document, sessionKey, expiresAt });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Try to surface the Move abort code if present
      const abortMatch = errMsg.match(/abort code[:\s]+(\d+)/i);
      setStage({
        type: "error",
        message: errMsg,
        abortCode: abortMatch?.[1],
      });
    }
  }, [stage, receipt, suiClient, walrusBlobId]);

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  if (!walrusBlobId) {
    return null; // No packet stored — nothing to show
  }

  const ttlDisplay =
    ttlRemaining !== null
      ? ttlRemaining > 0
        ? `${Math.floor(ttlRemaining / 60_000)}m ${Math.floor((ttlRemaining % 60_000) / 1000)}s remaining`
        : "Session expired"
      : null;

  const blobExpiryEstimate = isMockBlob
    ? null
    : new Date(Date.now() + WALRUS_CONFIGURED_EPOCHS * WALRUS_EPOCH_DURATION_MS);
  const accessExpiry = new Date(receipt.accessExpiresAtMs);
  const blobMismatch =
    !isMockBlob && blobExpiryEstimate !== null && blobExpiryEstimate < accessExpiry;

  return (
    <div data-testid="packet-panel" className="mt-4 border-t border-dashed border-line pt-4">
      <strong className="text-sm">Encrypted application packet</strong>

      {/* Three key facts */}
      <table className="mt-2 text-[0.85rem]">
        <tbody>
          <tr>
            <td className="pr-3 pb-1.5 font-semibold whitespace-nowrap align-top">Session TTL</td>
            <td className="pb-1.5">
              {ttlDisplay ?? "No active session"}
            </td>
          </tr>
          <tr>
            <td className="pr-3 pb-1.5 font-semibold whitespace-nowrap align-top">On-chain access expiry</td>
            <td className="pb-1.5">{accessExpiry.toISOString()}</td>
          </tr>
          <tr>
            <td className="pr-3 pb-1.5 font-semibold whitespace-nowrap align-top">Walrus blob lifetime (est.)</td>
            <td className="pb-1.5">
              {isMockBlob ? (
                <span data-testid="blob-mode-badge" data-mode="mock" className="text-amber">Mock blob — no real storage</span>
              ) : blobExpiryEstimate ? (
                <span className={blobMismatch ? "text-red" : undefined}>
                  ~{blobExpiryEstimate.toISOString()} ({WALRUS_CONFIGURED_EPOCHS} epochs)
                  {blobMismatch && " ⚠ Blob expires before access window"}
                </span>
              ) : (
                "Unknown"
              )}
            </td>
          </tr>
          <tr>
            <td className="pr-3 pb-1.5 font-semibold whitespace-nowrap align-top">Walrus blob ID</td>
            <td className="pb-1.5">
              <code className="break-all text-[0.8rem]">
                {walrusBlobId.slice(0, 40)}{walrusBlobId.length > 40 ? "…" : ""}
              </code>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Seal fallback banner */}
      {!useSeal && (
        <div role="alert" data-testid="seal-mode-alert" data-mode="fallback" className="alert warn mt-2 text-[0.85rem]">
          ⚠ Seal fallback mode: The packet uses AES-GCM encryption. Seal key servers are unavailable
          or not configured. Manual key handoff required.
        </div>
      )}

      {/* Mock blob warning */}
      {isMockBlob && useSeal && (
        <div role="alert" className="alert warn mt-2 text-[0.85rem]">
          ⚠ This receipt references a mock Walrus blob. Decryption is only possible if the blob was
          uploaded in the same browser session.
        </div>
      )}

      {/* Action buttons */}
      {useSeal && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(stage.type === "idle" || stage.type === "error") && (
            <Button
              onClick={handleRequestAccess}
              disabled={!account}
              title={!account ? "Connect your wallet first" : undefined}
            >
              Request access (sign session key)
            </Button>
          )}

          {(stage.type === "creating_session") && (
            <Button disabled>Creating session key…</Button>
          )}

          {stage.type === "signing" && (
            <Button disabled>Waiting for wallet signature…</Button>
          )}

          {(stage.type === "session_ready" || stage.type === "decrypted") && (
            <>
              <Button
                onClick={handleDecrypt}
                disabled={stage.type === "decrypted"}
              >
                {stage.type === "decrypted" ? "Packet decrypted" : "Decrypt packet"}
              </Button>
              <Button variant="secondary" onClick={handleRequestAccess}>
                New session
              </Button>
            </>
          )}

          {stage.type === "decrypting" && (
            <Button disabled>Fetching keys and decrypting…</Button>
          )}
        </div>
      )}

      {/* Error display */}
      {stage.type === "error" && (
        <div role="alert" className="mt-2 text-[0.85rem] text-red">
          <strong>Decryption failed:</strong> {stage.message}
          {(() => {
            // Prefer an abort code if one ever reaches us; otherwise fall back to
            // the locally verifiable diagnosis.
            const named =
              stage.abortCode && SEAL_ABORT_NAMES[stage.abortCode]
                ? { code: stage.abortCode, name: SEAL_ABORT_NAMES[stage.abortCode] as string }
                : diagnosePolicyDenial(receipt, account?.address ?? null);
            if (!named) return null;
            return (
              <div
                data-testid="seal-abort-name"
                data-abort-code={named.code}
                className="mt-1.5"
              >
                Denied by the on-chain policy: <strong>{named.name}</strong> (Move abort code{" "}
                {named.code}).
              </div>
            );
          })()}
          <br />
          <Button
            size="sm"
            className="mt-2 text-[0.85rem]"
            onClick={handleRequestAccess}
          >
            Try again
          </Button>
        </div>
      )}

      {/* Decrypted document — plaintext stays in browser memory only */}
      {stage.type === "decrypted" && (
        <div className="alert success mt-4">
          <strong>Application packet — synthetic data only</strong>
          <p className="mt-1 mb-3 text-[0.8rem] text-muted-ink">
            Plaintext is in browser memory only. Not logged, not sent anywhere.
          </p>
          <PacketDocumentView document={stage.document} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Packet document renderer
// ---------------------------------------------------------------------------

function PacketDocumentView({ document }: { document: PacketDocument }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Renter name", value: document.renterName ?? "(not provided)" },
    {
      label: "Monthly net salary (EUR)",
      value: document.payslipMonthlyNetEur != null ? String(document.payslipMonthlyNetEur) : "(not provided)",
    },
    { label: "Cover letter", value: document.coverLetter ?? "(not provided)" },
    { label: "Synthetic", value: document.synthetic ? "Yes" : "No" },
  ];

  return (
    <table className="text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="pr-3 pb-1.5 font-semibold whitespace-nowrap align-top">{r.label}</td>
            <td className="pb-1.5 whitespace-pre-wrap">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
