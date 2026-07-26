/** @type {import('next').NextConfig} */
const nextConfig = {
  // E2E builds set NEXT_DIST_DIR so they never overwrite the build in `.next`.
  // That build carries the developer's `.env.local` modes (Seal / Walrus HTTP);
  // the stubbed E2E tier pins mock modes and must not clobber it. Defaults to
  // the normal `.next` for every other build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
