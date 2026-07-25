# Walrus Adapter

`@rentdelegate/walrus` exposes a stable adapter interface:

- `upload(bytes)` returns a blob ID and size.
- `download(blobId)` returns bytes.
- `status(blobId)` returns `stored`, `not_found`, or `unknown`.

The active adapter is selected by the `WALRUS_MODE` / `NEXT_PUBLIC_WALRUS_MODE` environment
variable. A single factory in `packages/walrus/src/index.ts` reads this value and returns the
appropriate adapter, so web, agent, and provider all use the same selection logic.

---

## Three Modes

### `mock` (default)

`createMockWalrusAdapter()` stores bytes in memory and round-trips exactly. Blob IDs are prefixed
with `mock:` so every UI surface, log line, and README table can clearly label non-Walrus storage.
Mock mode is safe for offline development and CI — it never touches the network and never spends
wallet resources.

### `http`

`createWalrusHttpAdapter({ publisherUrl, aggregatorUrl })` implements the same `WalrusAdapter`
interface over the Walrus testnet publisher/aggregator HTTP API:

- `PUT /v1/blobs` to store
- `GET /v1/blobs/{blobId}` to read
- `GET /v1/blobs/{blobId}/status` for availability

The HTTP adapter runs unmodified in both Node.js and the browser (no `node:` imports). No wallet or
local CLI configuration is needed — the publisher is a trusted availability layer; confidentiality
relies on the ciphertext being encrypted before upload (only encrypted ciphertext is ever uploaded).

Default testnet endpoints (from `testnet.json`):
- Publisher: `https://publisher.walrus-testnet.walrus.space`
- Aggregator: `https://aggregator.walrus-testnet.walrus.space`

### `cli`

`createWalrusCliAdapter()` spawns `~/.local/bin/walrus` via Node.js `child_process`. It requires
a Walrus client configuration file at `~/.config/walrus/client_config.yaml` and a funded wallet
with WAL and SUI. This mode is **not** browser-compatible.

The adapter uses:

- `walrus store --epochs <n> --json <file>`
- `walrus read --out <file> <blobId>`
- `walrus blob-status --blob-id <blobId> --json`

Do not run CLI mode unless you intend to spend the configured wallet's WAL and SUI resources.

---

## `WALRUS_MODE` Environment Variable

| Value | Adapter | Notes |
|---|---|---|
| `mock` | `createMockWalrusAdapter()` | Default. Blob IDs prefixed `mock:`. Safe for CI and offline dev. |
| `http` | `createWalrusHttpAdapter(...)` | Works in browser and Node. No local wallet needed. |
| `cli` | `createWalrusCliAdapter()` | Node-only. Requires `~/.config/walrus/client_config.yaml`. |

Set `NEXT_PUBLIC_WALRUS_MODE` for the web frontend (exposed to the browser bundle); set
`WALRUS_MODE` for the agent and provider API.

---

## Live Evidence (RD-123 — HTTP Adapter)

A live upload smoke was run on 2026-07-25 using the HTTP adapter against the Walrus testnet
publisher. The CLI adapter was not run — no `~/.config/walrus/client_config.yaml` was available.

| Field | Value |
|---|---|
| Adapter | HTTP (`createWalrusHttpAdapter`) |
| Blob ID | `84g0OLjpe_P0nZYUqz2Vwy82C4EtTec0dNCXliXZCDc` |
| Packet hash | `0xbb247ab77e97539588f583534fe9631ebfc6c081ae176aa3325f0c44b1c95587` |
| Size | 172 bytes |
| Epochs | 5 |
| Publisher | `https://publisher.walrus-testnet.walrus.space` |
| Aggregator | `https://aggregator.walrus-testnet.walrus.space` |
| Explorer | https://walruscan.com/testnet/blob/84g0OLjpe_P0nZYUqz2Vwy82C4EtTec0dNCXliXZCDc |

Bytes were downloaded through the aggregator and verified byte-identical to the uploaded synthetic
storage-smoke payload. The app's renter packet path encrypts before upload; this script proves Walrus
availability and byte integrity only.
The blob ID and packet hash are recorded in `packages/contracts-config/testnet.json` under the
`walrus` block.

**CLI adapter status:** Implemented and unit-tested (`packages/walrus/src/cli.ts`). A live CLI
upload requires `~/.config/walrus/client_config.yaml` with a funded wallet — do not run without
the user's explicit go-ahead, since it spends real testnet WAL and SUI resources.
