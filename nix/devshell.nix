# devShell for Casium.
#
# Bundles the Node/pnpm/docker/postgres/caddy toolchain plus the pinned
# `sui` / `walrus` binaries, which are regular PATH members inside this
# shell (see AGENTS.md / plan/rules/global.md — this only applies inside
# `nix develop`; outside it, the old ~/.local/bin rule still holds). No
# binary-location env var is exported: `packages/walrus/src/cli.ts` spawns a
# bare `walrus` command resolved via PATH (explicit `walrusBin` option ->
# PATH; there is deliberately no ~/.local/bin fallback), so the PATH exposure
# here is what makes WALRUS_MODE=cli work.
#
# Playwright browsers are NOT vendored via pkgs.playwright-driver.browsers.
# Playwright downloads its own browsers (per @playwright/test's pinned
# version) and they run through nix-ld, so this shell exports NIX_LD /
# NIX_LD_LIBRARY_PATH. The host NixOS config must set
# `programs.nix-ld.enable = true;` — see docs/nix.md.
{
  pkgs,
  lib,
  sui,
  walrus,
}:

let
  # Runtime shared libraries Chromium / Firefox / WebKit need when launched
  # under nix-ld (Playwright downloads these browsers itself; this only
  # supplies the dynamic libraries they dlopen at runtime).
  nixLdLibraryPath = lib.makeLibraryPath (
    with pkgs;
    [
      stdenv.cc.cc.lib
      glib
      nss
      nspr
      atk
      at-spi2-atk
      at-spi2-core
      cups
      dbus
      expat
      libdrm
      mesa
      libgbm
      libxkbcommon
      pango
      cairo
      alsa-lib
      nghttp2
      fontconfig
      freetype
      zlib
      systemd
      libGL
      libX11
      libXcomposite
      libXdamage
      libXext
      libXfixes
      libXrandr
      libxcb
      libXcursor
      libXi
      libXrender
      libXtst
      libxshmfence
    ]
  );

  nixLd = lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

  # Local, devshell-scoped Docker config dir so `docker compose` (the compose
  # *plugin*, not the standalone docker-compose binary) resolves without
  # touching the user's real ~/.docker. docker-compose from nixpkgs installs
  # its plugin under $out/libexec/docker/cli-plugins/, which the docker CLI
  # discovers via $DOCKER_CONFIG/cli-plugins.
  dockerConfigDir = "$PWD/.nix/docker";
in
pkgs.mkShell {
  packages = [
    sui
    walrus
  ]
  ++ (with pkgs; [
    nodejs_22
    pnpm
    git
    docker-client
    docker-compose
    postgresql_16
    caddy
    jq
    curl
  ]);

  NIX_LD = nixLd;
  NIX_LD_LIBRARY_PATH = nixLdLibraryPath;

  shellHook = ''
    mkdir -p "${dockerConfigDir}/cli-plugins"
    ln -sf "${pkgs.docker-compose}/libexec/docker/cli-plugins/docker-compose" "${dockerConfigDir}/cli-plugins/docker-compose"
    if [ -f "$HOME/.docker/config.json" ] && [ ! -e "${dockerConfigDir}/config.json" ]; then
      ln -sf "$HOME/.docker/config.json" "${dockerConfigDir}/config.json"
    fi
    export DOCKER_CONFIG="${dockerConfigDir}"

    echo "casium devShell — node $(node --version), pnpm $(pnpm --version)"
    echo "  sui: $(sui --version 2>/dev/null)"
    echo "  walrus: $(walrus --version 2>/dev/null)"
    if [ ! -e /run/current-system/sw/share/nix-ld/lib/ld.so ]; then
      echo "  WARNING: nix-ld not detected on host — Playwright browsers will fail to launch." >&2
      echo "           Add programs.nix-ld.enable = true; to your NixOS config (see docs/nix.md)." >&2
    fi
  '';
}
