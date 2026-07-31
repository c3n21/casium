{
  description = "Casium devShell — sui, walrus, node, pnpm, docker, postgres, caddy";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);

      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      overlays.default = final: prev: {
        sui = final.callPackage ./nix/pkgs/sui.nix { };
        walrus = final.callPackage ./nix/pkgs/walrus.nix { };
      };

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          sui = pkgs.callPackage ./nix/pkgs/sui.nix { };
          walrus = pkgs.callPackage ./nix/pkgs/walrus.nix { };
        }
      );

      apps = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          sui = {
            type = "app";
            program = "${self.packages.${system}.sui}/bin/sui";
            meta.description = "Pinned Sui CLI (testnet-v1.76.0)";
          };
          walrus = {
            type = "app";
            program = "${self.packages.${system}.walrus}/bin/walrus";
            meta.description = "Pinned Walrus CLI (testnet-v1.52.1)";
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.callPackage ./nix/devshell.nix {
            sui = self.packages.${system}.sui;
            walrus = self.packages.${system}.walrus;
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt-rfc-style);
    };
}
