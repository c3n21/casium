# Pinned Sui CLI binary from Mysten Labs' testnet release tarball.
#
# Upstream ships ~a dozen large binaries per tarball (sui-node, sui-indexer,
# sui-bridge, move-analyzer, ...). We only install `sui` itself to keep the
# Nix store output small despite the ~1.1 GB source download.
#
# Only x86_64-linux has actually been built and run in this repo's sandbox.
# aarch64-linux uses a real, HTTP-200-verified release URL and hash but has
# not been build-verified here.
{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
}:

let
  version = "1.76.0";

  srcs = {
    x86_64-linux = fetchurl {
      url = "https://github.com/MystenLabs/sui/releases/download/testnet-v${version}/sui-testnet-v${version}-ubuntu-x86_64.tgz";
      hash = "sha256-SjTvIeVmUHcgZPlGkZ0mLZ4iECA0AH3M7DzDQYuTUF0=";
    };
    aarch64-linux = fetchurl {
      url = "https://github.com/MystenLabs/sui/releases/download/testnet-v${version}/sui-testnet-v${version}-ubuntu-aarch64.tgz";
      hash = "sha256-ttIZHv9JhQUa5ZxT+YV/hMgEZ6z7Gby/r8LEvgWOnOQ=";
    };
  };
in
stdenv.mkDerivation {
  pname = "sui";
  inherit version;

  src =
    srcs.${stdenv.hostPlatform.system}
      or (throw "sui: unsupported system ${stdenv.hostPlatform.system} (only x86_64-linux / aarch64-linux release tarballs exist)");

  nativeBuildInputs = [ autoPatchelfHook ];
  buildInputs = [ stdenv.cc.cc.lib ];

  sourceRoot = ".";

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 ./sui "$out/bin/sui"
    runHook postInstall
  '';

  meta = {
    description = "Sui CLI (testnet build) — command-line interface for the Sui blockchain";
    homepage = "https://github.com/MystenLabs/sui";
    license = lib.licenses.asl20;
    mainProgram = "sui";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
}
