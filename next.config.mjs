/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native SQLite driver must be loaded by Node, not bundled.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
}

export default nextConfig
