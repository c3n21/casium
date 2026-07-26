/**
 * Agent service stub (RD-144) — intercepts http://localhost:4022/**.
 *
 * The /agent page starts a run, then polls GET /runs/:id every 2 s. The stub
 * reports `running` for `pollsBeforeDone` polls so the stage list is exercised,
 * then returns the scripted result.
 */

import type { Page, Route } from "@playwright/test";
import {
  AGENT_HEALTH,
  completeRunResult,
  failedRunResult,
  ineligibleRunResult,
  type RunResult,
} from "./data.js";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export type RunScript = "complete" | "ineligible" | "failed";

export type AgentApiStub = {
  /** Which result the *next* run resolves to. */
  setScript(script: RunScript): void;
  /** Take the agent offline: /health rejects, so the page shows "Agent offline:". */
  setOffline(offline: boolean): void;
  /** Make POST /runs fail with a 500 so the start-run error path can be asserted. */
  failStart(fail: boolean): void;
  /** How many polls report `running` before the result lands (default 1). */
  setPollsBeforeDone(polls: number): void;
  /** Mandate IDs received by POST /runs, in order. */
  startedRuns(): { mandateId?: string; listingObjectId?: string }[];
};

export async function installAgentApiStub(
  page: Page,
  options: { script?: RunScript; offline?: boolean } = {},
): Promise<AgentApiStub> {
  let script: RunScript = options.script ?? "complete";
  let offline = options.offline ?? false;
  let startFails = false;
  let pollsBeforeDone = 1;
  const started: { mandateId?: string; listingObjectId?: string }[] = [];
  const pollCounts = new Map<string, number>();
  const runScripts = new Map<string, RunScript>();

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      headers: { "content-type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify(body),
    });

  const resultFor = (runId: string, kind: RunScript): RunResult => {
    if (kind === "complete") return completeRunResult(runId);
    if (kind === "ineligible") return ineligibleRunResult(runId);
    return failedRunResult(runId);
  };

  await page.route("http://localhost:4022/**", async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      return;
    }

    const path = new URL(request.url()).pathname;

    if (path === "/health") {
      if (offline) {
        await route.abort("connectionrefused");
        return;
      }
      await json(route, 200, AGENT_HEALTH);
      return;
    }

    if (method === "POST" && path === "/runs") {
      if (startFails) {
        await json(route, 500, { error: "INTERNAL" });
        return;
      }
      const body = (request.postDataJSON() ?? {}) as {
        mandateId?: string;
        listingObjectId?: string;
      };
      started.push(body);
      const runId = `run_${started.length}`;
      pollCounts.set(runId, 0);
      runScripts.set(runId, script);
      await json(route, 202, { runId, status: "running" });
      return;
    }

    const runMatch = /^\/runs\/([^/]+)$/.exec(path);
    if (method === "GET" && runMatch) {
      const runId = runMatch[1];
      if (!runScripts.has(runId)) {
        await json(route, 404, { error: "RUN_NOT_FOUND" });
        return;
      }
      const polls = (pollCounts.get(runId) ?? 0) + 1;
      pollCounts.set(runId, polls);

      if (polls <= pollsBeforeDone) {
        await json(route, 200, { runId, status: "running" });
        return;
      }

      const kind = runScripts.get(runId)!;
      // A "failed" script is a run that threw, not a run that completed with
      // status: "failed" — that distinction drives two different UI branches.
      if (kind === "failed") {
        await json(route, 200, {
          runId,
          status: "failed",
          error: "No packet registered for mandate",
        });
        return;
      }
      await json(route, 200, { runId, status: "done", result: resultFor(runId, kind) });
      return;
    }

    await json(route, 404, { error: "NOT_FOUND", path });
  });

  return {
    setScript(next) {
      script = next;
    },
    setOffline(next) {
      offline = next;
    },
    failStart(fail) {
      startFails = fail;
    },
    setPollsBeforeDone(polls) {
      pollsBeforeDone = polls;
    },
    startedRuns() {
      return started;
    },
  };
}
