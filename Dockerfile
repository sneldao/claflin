# ============================================
# Claflin - Production Dockerfile
# ============================================
# Multi-stage build for minimal production image
# Usage:
#   docker build -t claflin .
#   docker run -p 3000:3000 --env-file .env.local claflin
#
# Node major is pinned to match .nvmrc / package.json "engines".
# pnpm comes from package.json "packageManager" via corepack.

# ── Stage 1: Build ───────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
# postbuild runs scripts/cleanup-standalone.sh under bash.
RUN apk add --no-cache bash libc6-compat && corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .

# Next.js needs these at build time — provide safe defaults
ENV NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_PAYMENTS_ENABLED=true
ENV NEXT_PUBLIC_ERC8004_ENABLED=false

# Pin production mode explicitly. If NODE_ENV=development leaks in (CI shell,
# env-file sourcing), `next build` compiles but crashes prerendering Next's
# built-in /_not-found and /_global-error with a null-React hooks error.
# See package.json "build" script — same fix, defense in depth.
ENV NODE_ENV=production

# postbuild copies .next/static and public/ into .next/standalone and, in
# production, prunes the rest of .next — the standalone dir is the output.
# Redis placeholders are scoped to this one command (not ENV), so they are
# never baked into an image layer; real values come from --env-file at run.
# scripts/ stays in the context: lib/jesse imports scripts/jesse-agent-config.mjs.
RUN UPSTASH_REDIS_REST_URL=https://placeholder.upstash.io \
    UPSTASH_REDIS_REST_TOKEN=placeholder \
    pnpm build

# ── Stage 2: Production ──────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
