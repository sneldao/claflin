# Security Architecture

**Retained call-billing reference. Not the paper desk and not live stock execution.** Call-payment receipts stay separate from paper records and from any future trade receipt.

## Payment Security Model

All payments are **user-settled** — the server holds no private keys for payment transactions.

```
User Signs EIP-712 Typed Data → User's Wallet Submits On-Chain → Arbitrum
                                       ↑
                              MetaMask Smart Accounts
                              (user controls keys)
```

**Properties:**
- Zero payment private keys on the server
- User has full control over transaction timing and approval
- Platform cannot delay, freeze, or redirect funds
- No single point of compromise for user funds

## Server-Side Keys

The server does hold one key:

| Key | Purpose | Risk |
|---|---|---|
| `FACILITATOR_PRIVATE_KEY` | Signs ERC-8004 identity minting transactions | Loss = inability to mint new agent identities; no user funds at risk |

## API Security

- **Admin endpoints** (`PATCH /api/agents/:id`, `DELETE /api/agents/:id`): currently rely on network-level access control — add auth middleware before exposing publicly
- **Seed endpoint** (`POST /api/agents/seed`): should be restricted to internal/admin use in production

## Wallet Connection

MetaMask Smart Accounts Kit. The app never receives or stores private keys. All signing happens in the user's wallet extension or mobile app.

## Environment Variables

Sensitive values (`ELEVENLABS_API_KEY`, `FACILITATOR_PRIVATE_KEY`, `UPSTASH_REDIS_REST_TOKEN`) are:
- Stored in `.env.local` on the VPS (not committed to git)
- Read by PM2 via `ecosystem.config.js`, which loads `/opt/claflin/.env.hetzner` (also not committed)
- Set as encrypted secrets in Vercel dashboard

The `.gitignore` excludes `.env`, `.env.local`, `.env.production`, and
`.env.hetzner`. `ecosystem.config.js` IS committed because it contains
only public server paths (`/opt/claflin/current/server.js`, PM2
log locations) and no secrets — each server can replace it locally if
a different layout is needed.
