/** @type {import('next').NextConfig} */
const nextConfig = {
  // node-cron / child_process need the Node.js runtime, not edge
  serverExternalPackages: ["mysql2", "node-cron"],
  output: "standalone",
};

export default nextConfig;