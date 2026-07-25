# Browser Testing

How to drive the real app in a browser: inspect pages, connect a wallet, sign transactions, and
capture evidence for tickets whose acceptance criteria cannot be checked from a terminal.

Read this before starting any ticket with a **Browser verification** row.

## When You Need A Browser

Some of this system has no CLI path at all. Wallet signing, `SessionKey` personal-message approval,
and Web Crypto packet encryption all execute in page context. In particular, RD-136's landlord
decryption is a wallet signature followed by a key-server round trip — it is browser-only by
construction, and no amount of `curl` will verify it.

Everything else — Move behaviour, provider API responses, agent runs — is faster to verify from a
terminal. Use a browser when the thing under test *is* the browser.

## Harness Paths

Browser access is not built into this repo; it comes from whatever agent harness you are running.
Both supported paths reach the same app, but they do **not** share browser state.

### opencode — Playwright MCP

Configured in `opencode.json`, already committed:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["pnpm", "dlx", "@playwright/mcp",
        "--executable-path", "/home/<user>/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
        "--user-data-dir", "<repo>/.playwright-wallet-profile"],
      "enabled": true
    }
  }
}
```

- MCP config loads only at startup. After editing `opencode.json`, **restart opencode** or the server
  will not appear.
- The pinned `--executable-path` must exist. Check `ls ~/.cache/ms-playwright/`; the repo currently
  has `chromium-1228`. A Playwright upgrade changes that directory name and silently breaks launch.
- `--user-data-dir` is what makes the wallet session persist between runs. See below.

### Claude Code — `claude-in-chrome` skill

Invoke the `claude-in-chrome` skill **before** attempting any `mcp__claude-in-chrome__*` tool. It
drives your existing Chrome and requires site-level permission granted in the extension.

The important difference: it uses **your everyday Chrome profile**, not
`.playwright-wallet-profile/`. Wallet state, cookies, and connected-dapp permissions are therefore
completely separate from the opencode path. A wallet connected in one is not connected in the other.

### Neither harness available

`playwright@^1.61.1` is a devDependency of `@rentdelegate/web`, so a throwaway script can drive a
browser directly with `chromium.launchPersistentContext(...)` pointed at the same profile directory.
Keep such scripts in `/tmp`, not in the repo — they are debugging aids, not project infrastructure.

## The Wallet Profile

`.playwright-wallet-profile/` is gitignored local state. Verified contents as of 2026-07-25:

| Fact | Detail |
|---|---|
| No browser extension is installed | Only Chromium's built-in `Web Store` and `PDF Viewer` entries exist. **This is expected — do not install a wallet extension.** |
| The wallet is Slush's **web** wallet | Cookies are limited to `.google.com`, `accounts.google.com`, and `api.slush.app`. The session is reached by Google sign-in at `my.slush.app`. |
| The profile's whole purpose is that session | That is why `--user-data-dir` is pinned rather than using a fresh temp profile per run. |

If "Connect Wallet" fails to offer Slush, or offers it but never completes, the session has expired.
Re-authenticating means signing into a Google account in a browser — **that is the user's action, not
an agent's.** Ask; do not attempt it, and do not enter credentials on their behalf.

Deleting the profile directory is safe but destroys the session and forces re-authentication. Do not
delete it to "clean up".

## What Runs Where

| Service | Port | Start | Notes |
|---|---:|---|---|
| Web | 3000 | `pnpm --filter @rentdelegate/web dev` | Next.js default. Use `dev` for active UI work. |
| Web (built) | 3000 | `pnpm --filter @rentdelegate/web build` then `start` | `start` serves the build and does **not** hot-reload. Build first or you serve stale output. |
| Provider API | 4021 | `pnpm --filter @rentdelegate/provider-api build` then `start` | Overridable via `PORT`. |
| Agent service | 4022 | `pnpm --filter @rentdelegate/agent build` then `run start:server` | Required by the `/agent` page; without it the page shows "Agent offline". Use `run dev:server` for active agent work. Overridable via `AGENT_SERVER_PORT`. |

Check port 3000 is free before starting, and do not leave stale servers running:

```bash
ss -ltnp | grep -E ':(3000|4021|4022)'
```

For a short smoke it is acceptable to background a server with `nohup`:

```bash
nohup pnpm --filter @rentdelegate/web dev > /tmp/rentdelegate-web.log 2>&1 &
```

Treat that as a local testing helper, not project infrastructure. For repeated demo workflows prefer
a documented script or `tmux`, where logs and cleanup are explicit.

## Wallet Signing Pitfalls

Learned the hard way during RD-103/RD-108. These are behaviours of this app plus this wallet, not
general advice.

| Pitfall | What to do |
|---|---|
| `signAndExecuteTransaction` is unreliable through the popup handoff | Prefer wallet `signTransaction` plus app-side Sui `executeTransaction`. |
| Unresolved wallet gas data causes failures | Always set gas explicitly before signing: select a live SUI gas coin, then `tx.setGasBudget(...)` **and** `tx.setGasPayment(...)`. |
| Stale wallet tabs hold old transaction bytes, gas versions, and payloads | Refreshing, closing, and reopening tabs mid-test is fine and often necessary. |
| Approving an already-open request after a code change tests the old code | After changing signing or execution code, reload the app tab and start a **fresh** request. |
| A successful signature is not a passing test | Verify post-approval app state too — the app can still fail result parsing or object reads after a good signature. |
| gRPC effects omit `objectType` | Request `include: { effects: true, objectTypes: true }` and join created `objectId` values against `result.objectTypes[objectId]`. |
| Digests are not object IDs | Never record a tx digest or a placeholder like `(see tx)` as an object ID. For `create_mandate`, extract `RentalMandate`, `OwnerCap`, and `AgentCap` IDs properly. |
| Legacy JSON-RPC assumptions | The frontend uses Sui gRPC through `@mysten/sui`. Do not debug against JSON-RPC endpoints. |

## What Browser Verification Must Capture

A ticket's **Browser verification** row is satisfied by recording, in the ticket:

1. The app mode used — `dev` or built `start` — and the commit or branch.
2. The active storage and encryption modes on screen (`mock` / `http` / `cli`; `seal` / fallback).
3. The **positive** path: what was clicked, and the resulting object IDs and tx digests.
4. The **negative** path where the ticket has one: the refusal and the exact error surfaced.
5. Console errors, or an explicit statement that there were none.

A screenshot alone is not verification — it does not show which mode produced it. A tx digest with no
mode context is equally weak.

## Log Hygiene

Playwright MCP writes console logs to `.playwright-mcp/`. Both that directory and
`.playwright-wallet-profile/` are gitignored — keep it that way.

Those logs are not benign. Existing captures contain full Google OAuth URLs, `login_hint` with the
user's email address, and session identifiers. **Never commit them, never paste their contents into a
ticket, an issue, a PR, or a chat message, and never include them in demo evidence.** When you need
to cite a console error, quote the single relevant line and nothing else.

The same applies to anything on screen: this app handles wallet addresses and synthetic documents.
Never capture real credentials, seed phrases, or private keys, and remember that
`AGENT_SUI_PRIVATE_KEY` must never appear in a browser context at all.
