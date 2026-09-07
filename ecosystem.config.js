/**
 * PM2 Ecosystem Configuration
 * Claflin — Hetzner Production
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 *
 * Env vars are read from .env.hetzner (server secrets).
 * The `current` symlink points to the active release in releases/.
 * After deploy, reload with: pm2 delete claflin && pm2 start ecosystem.config.js && pm2 save
 */

const fs = require('fs');

const ENV_PATH = '/opt/claflin/.env.hetzner';

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq);
      const val = trimmed.slice(eq + 1);
      if (key && val !== undefined && !val.startsWith('${')) vars[key] = val;
    });
  return vars;
}

const env = loadEnv(ENV_PATH);

module.exports = {
  apps: [
    {
      name: 'claflin',
      script: '/opt/claflin/current/server.js',
      cwd: '/opt/claflin/current',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: env.NODE_ENV || 'production',
        PORT: env.PORT || '3042',
        HOSTNAME: env.HOSTNAME || '0.0.0.0',

        // Redis
        UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL || '',
        UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN || '',
        UPSTASH_REDIS_URL: env.UPSTASH_REDIS_URL || env.UPSTASH_REDIS_REST_URL || '',
        UPSTASH_REDIS_TOKEN: env.UPSTASH_REDIS_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '',

        // Chain
        BASE_RPC_URL: env.BASE_RPC_URL || 'https://mainnet.base.org',
        BASE_RPC_FALLBACK_URL: env.BASE_RPC_FALLBACK_URL || '',
        ARBITRUM_RPC_URL: env.ARBITRUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',

        // ElevenLabs
        ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY || '',
        ELEVENLABS_CONVERSATIONAL_ENABLED: env.ELEVENLABS_CONVERSATIONAL_ENABLED || 'true',
        ELEVENLABS_DEFAULT_VOICE: env.ELEVENLABS_DEFAULT_VOICE || 'Adam',
        ELEVENLABS_AGENT_SOLANA_SAGE: env.ELEVENLABS_AGENT_SOLANA_SAGE || '',
        ELEVENLABS_AGENT_CODE_REVIEWER: env.ELEVENLABS_AGENT_CODE_REVIEWER || '',
        ELEVENLABS_AGENT_GENERAL_HELPER: env.ELEVENLABS_AGENT_GENERAL_HELPER || '',
        ELEVENLABS_AGENT_TOUR_MASTER: env.ELEVENLABS_AGENT_TOUR_MASTER || '',

        // Payments
        PAYMENT_RECEIVER: env.PAYMENT_RECEIVER || '',
        FACILITATOR_PRIVATE_KEY: env.FACILITATOR_PRIVATE_KEY || '',
        AGENT_WALLET: env.AGENT_WALLET || '',

        // Tool integrations
        COMPOSIO_API_KEY: env.COMPOSIO_API_KEY || '',
        VENICE_API_KEY: env.VENICE_API_KEY || '',
        FIRECRAWL_API_KEY: env.FIRECRAWL_API_KEY || '',

        // Webhook
        NEXT_PUBLIC_WEBHOOK_URL: env.NEXT_PUBLIC_WEBHOOK_URL || '',
        AGENT_NOTIFICATION_WEBHOOK_URL: env.AGENT_NOTIFICATION_WEBHOOK_URL || '',

        // Public vars (baked at build time but also needed server-side)
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
        NEXT_PUBLIC_ERC8004_ENABLED: env.NEXT_PUBLIC_ERC8004_ENABLED || 'false',
        NEXT_PUBLIC_ERC8004_IDENTITY_ADDRESS: env.NEXT_PUBLIC_ERC8004_IDENTITY_ADDRESS || '',
        NEXT_PUBLIC_ERC8004_REPUTATION_ADDRESS: env.NEXT_PUBLIC_ERC8004_REPUTATION_ADDRESS || '',
        NEXT_PUBLIC_ERC8004_DELEGATION_ADDRESS: env.NEXT_PUBLIC_ERC8004_DELEGATION_ADDRESS || '',
        NEXT_PUBLIC_PLATFORM_ADDRESS: env.NEXT_PUBLIC_PLATFORM_ADDRESS || '',

        // Feature flags
        NEXT_PUBLIC_DEMO_MODE: env.NEXT_PUBLIC_DEMO_MODE || 'false',
        NEXT_PUBLIC_PAYMENTS_ENABLED: env.NEXT_PUBLIC_PAYMENTS_ENABLED || 'true',
        NEXT_PUBLIC_X402_ENABLED: env.NEXT_PUBLIC_X402_ENABLED || 'true',
        NEXT_PUBLIC_PAYMENT_SETTLEMENT_ENABLED: env.NEXT_PUBLIC_PAYMENT_SETTLEMENT_ENABLED || 'true',
      },
      error_file: '/opt/claflin/logs/pm2-err.log',
      out_file: '/opt/claflin/logs/pm2-out.log',
      log_file: '/opt/claflin/logs/pm2-combined.log',
      time: true,
      autorestart: true,
      max_memory_restart: '1G',
      watch: false,
      kill_timeout: 3000,
      restart_delay: 4000,
      min_instances: 1,
      max_restarts: 10,
      source_map_support: true,
    },
  ],
};
