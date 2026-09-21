/** @type {import('next').NextConfig} */
const nextConfig = {
  // node-cron / child_process need the Node.js runtime, not edge
  serverExternalPackages: ["mysql2", "node-cron"],
  output: "standalone",
    outputFileTracingIncludes: {
    '/': ['./node_modules/argon2/prebuilds/**/*'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  }
};

export default nextConfig;