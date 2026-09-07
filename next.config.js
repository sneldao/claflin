/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Standalone output for Hetzner/VPS deployment
  // Creates minimal server bundle in .next/standalone
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  
  // Optimize for production
  poweredByHeader: false,
  compress: true,

  images: {
    unoptimized: true,
  },

  // Timestamped build id for standalone releases.
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },

  // Server actions configuration
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },

  // Headers for security. CORS for /api/* is handled centrally in
  // proxy.ts (dynamic origin reflection + preflight handling), so we
  // deliberately do NOT set static Access-Control-* headers here — duplicate
  // or contradictory CORS headers make browsers reject the response.
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const csp = [
      "default-src 'self'",
      // unsafe-inline for styles (CSS-in-JS/runtime styles); unsafe-eval only in dev for HMR.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://*.elevenlabs.io`,
      "style-src 'self' 'unsafe-inline'",
      // ElevenLabs voice session (wss + https) and same-origin API. Dev adds
      // same-origin ws for HMR — 'self' already covers wss on modern engines.
      `connect-src 'self' wss://*.elevenlabs.io https://*.elevenlabs.io${isDev ? ' ws://localhost:*' : ''}`,
      "media-src 'self' blob:", // ConvAI audio + worklet buffers
      "worker-src 'self' blob:", // AudioWorklet / Three.js workers
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },

  // Same-origin API proxy — the architectural fix for the CORS failures.
  //
  // Topology: the Vercel deployment is a pure frontend; the Hetzner VPS runs
  // the real API. Previously the browser called the VPS directly
  // (cross-origin), so any backend restart/proxy error surfaced as a CORS
  // failure with no response body for the UI to work with.
  //
  // When API_PROXY_TARGET is set (Vercel production only), the browser calls
  // its OWN origin at /api/* and the Next.js server forwards the request
  // server-to-server — no browser CORS at all, no preflight round-trips,
  // first-party cookies, and ad-blockers stop flagging the calls.
  //
  // beforeFiles makes the proxy take precedence over the local route handlers
  // (which only have real backing services on the VPS anyway). Leave
  // API_PROXY_TARGET unset on the VPS itself and in local dev.
  async rewrites() {
    const target = (process.env.API_PROXY_TARGET || '').replace(/\/+$/, '');
    if (!target) return [];
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${target}/api/:path*`,
        },
      ],
    };
  },

  // Retired marketplace/directory/voice pages all fold back to Hetty's desk.
  // (Pages are deleted; this keeps any old bookmarks/external links from 404ing.)
  async redirects() {
    return [
      { source: '/admin/:path*', destination: '/', permanent: true },
      { source: '/broker/:id', destination: '/', permanent: true },
      { source: '/dashboard', destination: '/', permanent: true },
      { source: '/demo', destination: '/', permanent: true },
      { source: '/list-your-broker', destination: '/', permanent: true },
      { source: '/marketplace', destination: '/', permanent: true },
      { source: '/profile', destination: '/', permanent: true },
      { source: '/widget-probe', destination: '/', permanent: true },
    ];
  },

  // Webpack configuration — no retired client-only SDKs to externalize.
  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;
