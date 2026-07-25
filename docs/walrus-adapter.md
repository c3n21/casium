# Walrus Adapter

RD-101 adds `@rentdelegate/walrus` with a stable adapter interface:

- `upload(bytes)` returns a blob ID and size.
- `download(blobId)` returns bytes.
- `status(blobId)` returns `stored`, `not_found`, or `unknown`.

## Mock Mode

Use `createMockWalrusAdapter()` for local development and tests. Blob IDs are prefixed with `mock:` so UI and docs can clearly label non-Walrus storage.

Mock mode stores bytes in memory and round-trips exactly.

## Walrus CLI Mode

Use `createWalrusCliAdapter()` only when a real Walrus client/wallet is configured. By default it calls `~/.local/bin/walrus` without modifying `PATH`.

The adapter uses:

- `walrus store --epochs <n> --json <file>`
- `walrus read --out <file> <blobId>`
- `walrus blob-status --blob-id <blobId> --json`

Do not run live upload smoke tests unless you intend to spend the configured wallet's Walrus/Sui resources.
