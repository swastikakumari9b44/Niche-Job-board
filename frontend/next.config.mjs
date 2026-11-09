const isProd = process.env.NODE_ENV === "production";

// Origin of the backend API (Render). The browser may only call this origin (plus Razorpay) from our pages.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
let apiOrigins = [];
try {
  const u = new URL(apiUrl);
  apiOrigins = [u.origin];
  // In local development the app swaps localhost <-> 127.0.0.1 to keep the login cookie working (see lib/api.js).
  if (!isProd && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) {
    apiOrigins = [`${u.protocol}//localhost:${u.port}`, `${u.protocol}//127.0.0.1:${u.port}`];
  }
} catch {
  apiOrigins = [];
}

// Content-Security-Policy. Next.js injects small inline scripts, so 'unsafe-inline' is still needed for scripts/styles
// (a nonce-based policy would force every page to render dynamically). Everything else is locked down.
// Razorpay Checkout needs its script, its iframe and its API; nothing else third-party is allowed.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigins.join(" ")} https://api.razorpay.com https://lumberjack.razorpay.com${isProd ? "" : " ws: wss:"}`.replace(/\s+/g, " ").trim(),
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }, // keeps Razorpay's popup flow working
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The navbar "Dashboard" link and the dashboard sidebars point at /employer and /candidate, which have no page (they returned 404).
  async redirects() {
    return [
      { source: "/employer", destination: "/employer/dashboard", permanent: false },
      { source: "/candidate", destination: "/candidate/dashboard", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
