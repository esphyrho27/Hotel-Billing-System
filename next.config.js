/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Keeps PHP sessions same-origin when Next runs on :3000 and Apache/XAMPP
    // serves the existing API on its configured origin.
    const backend =
      process.env.PHP_BACKEND_URL || "http://localhost/api-hotel";
    return [
      { source: "/portal.php", destination: `${backend}/portal.php` },
      { source: "/htl-api/portal.php", destination: `${backend}/portal.php` },
      { source: "/htl-api/api/:path*", destination: `${backend}/:path*` },
      { source: "/htl-api/:path*", destination: `${backend}/:path*` },
      { source: "/api/:path*", destination: `${backend}/:path*` },
    ];
  }
};

module.exports = nextConfig;
