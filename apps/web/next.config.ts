import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load the repo-root .env so both apps share one env file.
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  // No transpilePackages. Both workspace packages are COMPILED now (tsc -> dist, with
  // exports pointing there), so Next consumes plain JS like any other dependency. Leaving
  // them listed made Next resolve the TypeScript source instead, where the ESM `./x.js`
  // specifiers do not match the `.ts` files on disk and webpack fails to resolve them.

  // Standalone output for the production image: Next traces the actual module graph and
  // emits a self-contained server, which turns a ~1.1 GB pnpm workspace into ~200 MB. The
  // tracing root has to be the monorepo root, not apps/web, or the trace stops at the
  // pnpm symlinks and the container boots missing @khelkhud/shared.
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
};

export default nextConfig;
