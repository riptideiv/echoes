/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output for publishing
  output: "standalone",
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
