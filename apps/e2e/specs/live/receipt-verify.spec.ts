/**
 * Flow 5 — the provider accepts an application only after reading its receipt
 * off Sui itself.
 *
 * This is the one place the whole loop closes without a wallet. The receipt
 * `LIVE_AGENT_RUN.receiptId` is a real `ApplicationReceipt` on testnet, created
 * by a real agent-signed `submit_application`. The reservation below is built
 * *from that object* — blob ID and packet hash are read off chain rather than
 * restated — so `POST /applications/:id/verify` performs the same comparison it
 * would in a live run, against the same object, and returns `accepted`.
 *
 * Nothing here writes to chain. The receipt already exists; the test only
 * proves the provider will not take the agent's word for it.
 */

import { LIVE_AGENT_RUN, SMOKE } from "@casium/contracts-config";
import { expect, test } from "../../src/live/test.js";
import { AGENT_EVM_ADDRESS } from "../../src/live/env.js";
import {
  createListing,
  errorCode,
  getApplication,
  reserve,
  verifyReceipt,
  type ProviderListing,
  type ReserveBody,
} from "../../src/live/providerApi.js";
import { readReceipt, receiptBlobId, receiptPacketHash } from "../../src/live/chain.js";

/**
 * Reserve an application that mirrors the on-chain receipt field for field.
 * The provider's verifier compares mandate, listing, agent, provider, landlord,
 * blob ID, packet hash and status — anything left un-mirrored fails as
 * RECEIPT_INVALID, which is the point of the negative test below.
 */
async function reserveMirroring(
  request: import("@playwright/test").APIRequestContext,
  listing: ProviderListing,
  headers: Record<string, string>,
) {
  const receipt = await readReceipt(LIVE_AGENT_RUN.receiptId);

  const body: ReserveBody = {
    mandateId: receipt.mandateId,
    listingObjectId: receipt.listingId,
    agentSuiAddress: receipt.agent,
    agentEvmAddress: AGENT_EVM_ADDRESS,
    walrusBlobId: receiptBlobId(receipt),
    packetHash: receiptPacketHash(receipt),
    accessExpiresAtMs: receipt.accessExpiresAtMs,
    idempotencyKey: crypto.randomUUID(),
  };

  const response = await reserve(request, listing.id, body, headers);
  expect(response.status()).toBe(202);
  return { receipt, application: await response.json() };
}

test.describe("accepting a real on-chain receipt", () => {
  // No retries. The provider rejects a transaction digest it has already
  // recorded — correct behaviour, and it makes a second attempt at this test
  // fail for a reason that has nothing to do with the first failure.
  test.describe.configure({ retries: 0 });

  test("the provider verifies the receipt against testnet and accepts", async ({
    page,
    request,
    listing,
    human,
  }) => {
    const { receipt, application } = await reserveMirroring(request, listing, human.headers);

    const verified = await verifyReceipt(request, application.id, {
      txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
      receiptId: LIVE_AGENT_RUN.receiptId,
    });

    expect(verified.status()).toBe(200);
    const accepted = await verified.json();
    expect(accepted.status).toBe("accepted");
    // Every value below was read from chain by the provider, not echoed back
    // from the request.
    expect(accepted.receipt).toMatchObject({
      receiptId: LIVE_AGENT_RUN.receiptId,
      mandateId: receipt.mandateId,
      listingObjectId: receipt.listingId,
      submittedAtMs: receipt.submittedAtMs,
      accessExpiresAtMs: receipt.accessExpiresAtMs,
      // The blob is a labeled mock, so the hash-of-ciphertext check is skipped
      // rather than silently passed.
      blobVerification: "skipped-mock",
    });

    expect((await getApplication(request, application.id)).status).toBe("accepted");

    // …and the provider dashboard shows it as accepted, linked to the receipt
    // object on chain. This is Step 8 of docs/demo-script.md.
    await page.goto("/provider");
    await expect(page.getByText(application.id, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(LIVE_AGENT_RUN.receiptId.slice(0, 16)) }),
    ).toBeVisible();

    // Replaying the same digest must not accept a second application: one
    // on-chain submission, one accepted application.
    const other = await createListing(request);
    const { application: secondApplication } = await reserveMirroring(
      request,
      other,
      human.headers,
    );
    const replay = await verifyReceipt(request, secondApplication.id, {
      txDigest: LIVE_AGENT_RUN.submitApplicationTxDigest,
      receiptId: LIVE_AGENT_RUN.receiptId,
    });

    expect(replay.status()).toBe(422);
    expect(await errorCode(replay)).toBe("RECEIPT_INVALID");
    expect((await getApplication(request, secondApplication.id)).status).toBe("reserved");
  });
});

test("a receipt belonging to a different application is refused", async ({
  request,
  listing,
  human,
}) => {
  const { application } = await reserveMirroring(request, listing, human.headers);

  // A real testnet receipt — for another mandate, another packet. Reading it
  // succeeds; matching it against this application must not.
  const response = await verifyReceipt(request, application.id, {
    txDigest: SMOKE.createMandateTxDigest,
    receiptId: SMOKE.receiptId,
  });

  expect(response.status()).toBe(422);
  expect(await errorCode(response)).toBe("RECEIPT_INVALID");
  expect((await getApplication(request, application.id)).status).toBe("reserved");
});

test("a receipt object that does not exist is refused", async ({ request, listing, human }) => {
  const { application } = await reserveMirroring(request, listing, human.headers);

  const response = await verifyReceipt(request, application.id, {
    txDigest: `e2e-${crypto.randomUUID()}`,
    receiptId: `0x${"e".repeat(64)}`,
  });

  expect(response.status()).toBe(422);
  expect(await errorCode(response)).toBe("RECEIPT_INVALID");
});

test("a reserved application shows its World human and the manual verify control", async ({
  page,
  request,
  listing,
  human,
}) => {
  const { application } = await reserveMirroring(request, listing, human.headers);

  await page.goto("/provider");

  await expect(page.getByText(application.id, { exact: true })).toBeVisible();
  // The uniqueness proof the provider keeps: a human hash, never an identity.
  await expect(page.getByText(new RegExp(human.humanIdHash.slice(0, 18)))).toBeVisible();
  // `getByText` would match both <details> and <summary> — strict-mode violation.
  await expect(page.locator("summary", { hasText: "Verify Sui receipt" }).first()).toBeVisible();
});
