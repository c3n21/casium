/**
 * Provider API stub (RD-144) — intercepts http://localhost:4021/**.
 *
 * Backed by a per-test mutable store so specs can assert state transitions
 * (verify flips reserved -> accepted) without running a server.
 *
 * CORS: the app is served from :3000 and posts JSON to :4021, so the browser
 * sends an OPTIONS preflight first. Fulfilling it here is not optional — miss
 * it and every POST fails before the handler runs.
 */

import type { Page, Route } from "@playwright/test";
import {
  RESERVED_APPLICATION,
  SEEDED_LISTINGS,
  type ProviderListing,
  type ReservedApplication,
} from "./data.js";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,agentkit,x-correlation-id",
};

export type PacketRegistration = {
  mandateId: string;
  providerListingId?: string;
  walrusBlobId: string;
  packetHash: string;
  sizeBytes: number;
  encryptionMode: string;
};

export type ProviderApiStub = {
  /** Replace the listing set (e.g. [] for the empty state). */
  setListings(listings: ProviderListing[]): void;
  setApplications(applications: ReservedApplication[]): void;
  setPackets(packets: PacketRegistration[]): void;
  /** Fail GET /listings with a 500 so the error branch can be asserted. */
  failListings(fail: boolean): void;
  /** Fail POST /applications/:id/verify with 422 RECEIPT_INVALID. */
  failVerify(fail: boolean): void;
  /** Fail POST /packets with 422 so PacketBuilder's error path can be asserted. */
  failPackets(fail: boolean): void;
  /** Every packet registration body received, in order. */
  packetRegistrations(): PacketRegistration[];
};

export async function installProviderApiStub(
  page: Page,
  options: {
    listings?: ProviderListing[];
    applications?: ReservedApplication[];
  } = {},
): Promise<ProviderApiStub> {
  let listings = options.listings ?? [...SEEDED_LISTINGS];
  let applications = options.applications ?? [];
  let listingsFail = false;
  let verifyFail = false;
  let packetsFail = false;
  const packets: PacketRegistration[] = [];

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      headers: { "content-type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify(body),
    });

  await page.route("http://localhost:4021/**", async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "GET" && path === "/health") {
      await json(route, 200, { ok: true, service: "provider-api", store: "memory" });
      return;
    }

    if (method === "GET" && path === "/listings") {
      if (listingsFail) {
        await json(route, 500, { error: "INTERNAL" });
        return;
      }
      await json(route, 200, { listings });
      return;
    }

    if (method === "GET" && path === "/applications") {
      const mandateId = url.searchParams.get("mandateId");
      const filtered = mandateId
        ? applications.filter((a) => a.mandateId === mandateId)
        : applications;
      await json(route, 200, { applications: filtered });
      return;
    }

    const packetsByMandateMatch = /^\/packets\/by-mandate\/(.+)$/.exec(path);
    if (method === "GET" && packetsByMandateMatch) {
      const mandateId = decodeURIComponent(packetsByMandateMatch[1]!);
      await json(route, 200, {
        packets: packets.filter((packet) => packet.mandateId === mandateId),
      });
      return;
    }

    const packetExactMatch = /^\/packets\/([^/]+)\/([^/]+)$/.exec(path);
    if (method === "GET" && packetExactMatch) {
      const mandateId = decodeURIComponent(packetExactMatch[1]!);
      const providerListingId = decodeURIComponent(packetExactMatch[2]!);
      const packet = packets.find(
        (p) => p.mandateId === mandateId && p.providerListingId === providerListingId,
      );
      await json(route, packet ? 200 : 404, packet ?? { error: "PACKET_NOT_FOUND" });
      return;
    }

    const packetByMandateMatch = /^\/packets\/([^/]+)$/.exec(path);
    if (method === "GET" && packetByMandateMatch) {
      const mandateId = decodeURIComponent(packetByMandateMatch[1]!);
      const packet = packets.find((p) => p.mandateId === mandateId);
      await json(route, packet ? 200 : 404, packet ?? { error: "PACKET_NOT_FOUND" });
      return;
    }

    if (method === "POST" && path === "/packets") {
      if (packetsFail) {
        await json(route, 422, { error: "INVALID_PACKET_RECORD" });
        return;
      }
      const body = request.postDataJSON() as PacketRegistration;
      packets.push(body);
      await json(route, 201, { ...body, registeredAtMs: Date.now() });
      return;
    }

    const verifyMatch = /^\/applications\/([^/]+)\/verify$/.exec(path);
    if (method === "POST" && verifyMatch) {
      if (verifyFail) {
        await json(route, 422, { error: "RECEIPT_INVALID" });
        return;
      }
      const id = verifyMatch[1];
      const body = request.postDataJSON() as { txDigest: string; receiptId: string };
      applications = applications.map((a) =>
        a.id === id
          ? {
              ...a,
              status: "accepted" as const,
              receipt: {
                receiptId: body.receiptId,
                txDigest: body.txDigest,
                mandateId: a.mandateId,
                listingObjectId: a.listingObjectId,
                submittedAtMs: 1_784_962_851_988,
                accessExpiresAtMs: 1_790_000_000_000,
              },
            }
          : a,
      );
      const updated = applications.find((a) => a.id === id);
      await json(route, 200, updated ?? { error: "APPLICATION_NOT_FOUND" });
      return;
    }

    const withdrawMatch = /^\/applications\/([^/]+)\/withdraw$/.exec(path);
    if (method === "POST" && withdrawMatch) {
      const id = withdrawMatch[1];
      applications = applications.map((a) =>
        a.id === id ? { ...a, status: "withdrawn" as const } : a,
      );
      await json(route, 200, applications.find((a) => a.id === id) ?? {});
      return;
    }

    await json(route, 404, { error: "NOT_FOUND", path });
  });

  return {
    setListings(next) {
      listings = next;
    },
    setApplications(next) {
      applications = next;
    },
    setPackets(next) {
      packets.splice(0, packets.length, ...next);
    },
    failListings(fail) {
      listingsFail = fail;
    },
    failVerify(fail) {
      verifyFail = fail;
    },
    failPackets(fail) {
      packetsFail = fail;
    },
    packetRegistrations() {
      return packets;
    },
  };
}

export { RESERVED_APPLICATION };
