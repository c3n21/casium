/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@mysten/dapp-kit-react",
    "@mysten/dapp-kit-core",
    "@mysten/seal",
    "@mysten/sui",
    "@rentdelegate/seal",
    "@rentdelegate/sui-client",
    "@rentdelegate/shared",
    "@rentdelegate/walrus",
  ],
  typescript: {
    // Type checking is done separately via `typecheck` script (tsc --noEmit).
    // This avoids Next.js 16 pnpm monorepo TypeScript detection issues.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
