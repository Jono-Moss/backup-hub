/** @type {import('next').NextConfig} */
const nextConfig = {
  // node-cron / child_process need the Node.js runtime, not edge
  serverExternalPackages: ["mysql2", "node-cron", "ssh2", "ssh2-sftp-client"],
  output: "standalone",
    outputFileTracingIncludes: {
    '/': ['./node_modules/argon2/prebuilds/**/*'],
  },
  compiler: {
    // Keep errors and warnings in production: they're the only record of
    // failures that happen in the background (uploads, notifications, backup
    // checks, test-restore server problems).
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  }
};

export default nextConfig;