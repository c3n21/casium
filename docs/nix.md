# Nix devShell

The flake at the repo root (`flake.nix`, `nix/devshell.nix`, `nix/pkgs/{sui,walrus}.nix`) is the
preferred way to set up a working environment for this repo on NixOS. `README.md` §Prerequisites
covers the fallback manual-install path; this file covers the Nix path in more depth.

## Usage

```bash
nix develop
```

or, with direnv (`.envrc` containing `use flake`):

```bash
direnv allow
```

This puts `sui` (1.76.0), `walrus` (1.52.1), `node` (22.x), `pnpm`, `git`, `docker`, `docker compose`,
`psql`/`pg_isready`, and `caddy` on `PATH`, all pinned to the versions declared in `flake.nix` /
`flake.lock`. Inside the shell, `sui move build --path packages/move` and `walrus wallet --json`
work as bare commands — no path prefix needed.

**Outside `nix develop`, the old rule still applies**: `sui` and `walrus` are not installed on
system `PATH`. They live in `~/.local/bin/` and must be invoked by full path
(`~/.local/bin/sui move build --path packages/move`), or via `nix run .#sui -- ...` /
`nix run .#walrus -- ...`, which works without entering the shell at all. Do not export
`~/.local/bin` into `PATH` and do not edit shell startup files to work around this — see
AGENTS.md / `plan/rules/global.md`.

`WALRUS_MODE=cli` (`packages/walrus/src/cli.ts`, `createWalrusCliAdapter`) invokes a bare
`walrus` command — resolution is `options.walrusBin` if given, else the literal string
`"walrus"`, resolved via `PATH` by `child_process.spawn` (no shell, so this is a real execvp
lookup, not string interpolation). The devShell satisfies this automatically. Outside the
devShell there is **no** automatic `~/.local/bin` discovery any more — this is deliberate: put
`walrus` on `PATH` yourself for that one shell invocation if you need `WALRUS_MODE=cli` outside
`nix develop`, e.g. `PATH="$HOME/.local/bin:$PATH" pnpm --filter @casium/walrus check:env`. Do
not export that into a shell startup file or make it the default — see AGENTS.md /
`plan/rules/global.md`. `WALRUS_MODE=http` (the browser/live-demo default) is unaffected; it
talks to the Walrus HTTP aggregator/publisher directly and never shells out.

## Required host NixOS configuration

```nix
{
  nix.settings.experimental-features = [ "nix-command" "flakes" ];
  programs.nix-ld.enable = true;
  virtualisation.docker.enable = true;
}
```

`nix-ld` is required for Playwright (see below); `virtualisation.docker.enable` is required for
`docker compose up -d postgres` / `pnpm demo:up` with `PROVIDER_STORE=postgres`.

## Playwright via nix-ld

This devShell deliberately does **not** vendor `pkgs.playwright-driver.browsers`. Playwright
downloads its own browser binaries (matching the `@playwright/test@1.61.1` pin in
`apps/e2e/package.json`) into `~/.cache/ms-playwright` the first time a test runs, exactly as it
would on a non-Nix machine. Because those browsers are dynamically linked against a normal FHS
layout that doesn't exist on NixOS, the devShell exports:

- `NIX_LD` — the glibc dynamic linker path (`lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker"`).
- `NIX_LD_LIBRARY_PATH` — a `lib.makeLibraryPath` of the shared libraries Chromium/Firefox/WebKit
  need at runtime (glib, nss, nspr, atk/at-spi2, cups, dbus, mesa/libgbm, the X11 libs, etc.).

For this to work, the **host** NixOS configuration must set `programs.nix-ld.enable = true;` —
this is a system-level setting the devShell cannot provide on its own; it installs
`/run/current-system/sw/share/nix-ld/lib/ld.so` and wires the kernel's binfmt-adjacent loader
path. The devShell's `shellHook` checks for that file and prints a warning if it's missing.

If a Playwright browser fails to launch inside `nix develop` (typically a `cannot open shared
object file` error, or the browser process exiting immediately):

1. Confirm `programs.nix-ld.enable = true;` is set on the host and you've rebuilt/switched.
2. Confirm `echo $NIX_LD` and `echo $NIX_LD_LIBRARY_PATH` are non-empty inside the shell.
3. Run the failing browser binary directly (e.g. `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome
   --version`) to see the actual missing-library error, and add the corresponding nixpkgs
   attribute to the `nixLdLibraryPath` list in `nix/devshell.nix`.

## Bumping the sui / walrus version

1. Pick the new release tag (e.g. `testnet-v1.77.0`) and edit `version` in `nix/pkgs/sui.nix` (or
   `nix/pkgs/walrus.nix`).
2. Re-fetch the hash for each platform's tarball:
   ```bash
   nix store prefetch-file --json https://github.com/MystenLabs/sui/releases/download/testnet-v<VER>/sui-testnet-v<VER>-ubuntu-x86_64.tgz
   nix store prefetch-file --json https://github.com/MystenLabs/sui/releases/download/testnet-v<VER>/sui-testnet-v<VER>-ubuntu-aarch64.tgz
   ```
3. Paste the returned `hash` (SRI, `sha256-...`) into the matching `srcs.<system>` entry. Do not
   guess or reuse an old hash — a wrong hash fails the build with a clear mismatch error.
4. `nix build .#sui` (or `.#walrus`) and run the result to confirm the version string:
   ```bash
   ./result/bin/sui --version
   ```
5. Update the pinned version mentioned in this file and in `README.md`/`AGENTS.md` if they quote
   it, and re-run `nix flake check`.

Only x86_64-linux has actually been built and run for this repo; aarch64-linux uses real,
HTTP-verified release URLs and hashes but has not been build-verified here.

## pnpm version note

`package.json` must keep `packageManager` in sync with the `pnpm` version in the pinned nixpkgs
input — both are currently **11.17.0**.

This is not cosmetic. pnpm 10+ enables `manage-package-manager-versions` by default: when the
two disagree, pnpm ignores the binary Nix put on `PATH` and downloads the version named in
`packageManager` into `~/.local/share/pnpm/.tools/`. That silently defeats the pin and makes the
devShell require network access on first use. The symptom is `pnpm --version` disagreeing with
`$(command -v pnpm)` — e.g. the store path reading `pnpm-11.17.0` while `pnpm --version` prints
something else.

So when you bump the nixpkgs input, check `nix eval nixpkgs#pnpm.version` and update
`packageManager` to match. Bumping across a pnpm major may churn `pnpm-lock.yaml`; bumping within
one should not.

## Docker compose plugin wiring

`docker-compose` from nixpkgs installs the `docker compose` CLI *plugin* under
`${docker-compose}/libexec/docker/cli-plugins/docker-compose` (the standalone `docker-compose`
binary is also on `PATH`, but this repo's scripts and `package.json` (`db:up`, `db:down`, `db:reset`)
call `docker compose`, not `docker-compose`). The devShell's `shellHook` symlinks that plugin into
a devShell-local `$PWD/.nix/docker/cli-plugins/`, symlinks in `~/.docker/config.json` if present
(so registry auth carries over), and exports `DOCKER_CONFIG` to that directory — verified with
`docker compose version` inside `nix develop`.
