import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Loads the repo-root .env (not frontend/.env.local) so both apps share one
// file — Next.js only auto-loads env files from its own project directory,
// so this has to happen explicitly before config/build reads process.env.
loadEnvConfig(path.join(process.cwd(), ".."));

const nextConfig: NextConfig = {/* config options here */};

export default nextConfig;
