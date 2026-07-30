# Walrus and packet-privacy rules

- Walrus blobs are **public and effectively permanent**. Only encrypted ciphertext may be
  uploaded or referenced. A mistake here cannot be patched — the bytes are already out.
- Plaintext never reaches the provider API. The provider stores blob IDs, hashes, and sizes.
- Mode is resolved by one factory (`WALRUS_MODE` / `NEXT_PUBLIC_WALRUS_MODE`, one of
  `mock | http | cli`) and consumed everywhere. Mock blob IDs keep the `mock:` prefix.
- Every surface displaying a blob ID must render the **active** mode from the resolved
  value. A prop default that can disagree with configuration is the bug to avoid.
- `cli` mode is not usable in the browser; the browser falls back to the mock adapter.
- Check the configured blob lifetime against any access window before relying on a blob
  still being retrievable.
