import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM runtime + data file that must be loaded from disk at
  // runtime rather than bundled. Keeping it external lets Node resolve those
  // assets natively on the server.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
