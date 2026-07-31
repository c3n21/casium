# Pinned Walrus CLI binary from Mysten Labs' testnet release tarball.
#
# The tarball also ships walrus-node, walrus-deploy, and walrus-upload-relay;
# we only install `walrus` itself. The binary inside the tarball is already
# named `walrus` (not suffixed with the release tag), so no rename is needed.
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
  version = "1.52.1";

  srcs = {
    x86_64-linux = fetchurl {
      url = "https://github.com/MystenLabs/walrus/releases/download/testnet-v${version}/walrus-testnet-v${version}-ubuntu-x86_64.tgz";
      hash = "sha256-RgZLbR1ObSGPKOwEjAMAKLzxwiyF5JgIEoJJ8iSFtPs=";
    };
    aarch64-linux = fetchurl {
      url = "https://github.com/MystenLabs/walrus/releases/download/testnet-v${version}/walrus-testnet-v${version}-ubuntu-aarch64.tgz";
      hash = "sha256-eJiWPju9vRBTmQlqR0owKHwWs/pnAIHu8jxvWuFnS3Y=";
    };
  };
in
stdenv.mkDerivation {
  pname = "walrus";
  inherit version;

  src =
    srcs.${stdenv.hostPlatform.system}
      or (throw "walrus: unsupported system ${stdenv.hostPlatform.system} (only x86_64-linux / aarch64-linux release tarballs exist)");

  nativeBuildInputs = [ autoPatchelfHook ];
  buildInputs = [ stdenv.cc.cc.lib ];

  sourceRoot = ".";

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 ./walrus "$out/bin/walrus"
    runHook postInstall
  '';

  meta = {
    description = "Walrus CLI (testnet build) — command-line interface for the Walrus decentralized blob store";
    homepage = "https://github.com/MystenLabs/walrus";
    license = lib.licenses.asl20;
    mainProgram = "walrus";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
}
