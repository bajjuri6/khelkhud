import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load the repo-root .env so both apps share one env file.
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@khelkhud/shared"],
};

export default nextConfig;
