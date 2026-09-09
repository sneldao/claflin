# Live Base Execution Sprint

**Goal:** Claflin submits a working live trade on Base for the Builder Quest.  
**Deadline:** Loom recording once the end-to-end swap has been tested on mainnet (real funds, small size).  
**Team:** 3 developers. Work in parallel, integrate at `main` only after pair review.

## Current status (2026-09-09)

- **Track A — verified router + call builder: DONE.**
  - `AERODROME_SWAP_ROUTER` is `0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F` (Gauges V3 / newest CL2 factory).
  - The legacy `0xBE6D…` initial Slipstream router was verified to only route the legacy factory; it reverted on `exactInputSingle` for the CL2 stock pools.
  - `lib/trading/aerodrome-router.ts` builds `exactInputSingle` and ERC-20 `approve` calldata.
  - Unit tests pass.
- **Track B — client signer + execution: DONE.**
  - `useDeskAuth` exposes `sendTransaction` via Privy's `useSendTransaction`.
  - `lib/trading/execute-swap.ts` reads allowance/balance, sends approval if needed, executes swap, and waits for receipt.
  - `lib/trading/useDeskExecution.ts` React hook for the ticket.
- **Track C — UI / mode gate: DONE.**
  - `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED` env gate.
  - `TradeTicket` shows slippage selector and two-step `Approve` / `Execute on Base`.
  - Live copy, wallet banner, outcome stamp, and BaseScan link.
- **Mainnet smoke test: PASSED.**
  - Tx `0x4877…3bf8775`
  - Wallet `0x7c57…d64b` bought `0.00030199 GOOGLc` for `0.10 USDC` on Base.
  - Status: `filled`.
- **Remaining:** record the Loom demo.

## How to enable live mode locally

Add to `.env.local`:

```bash
NEXT_PUBLIC_LIVE_EXECUTION_ENABLED=true
```

Then restart `pnpm dev`. With the flag off (or unset), the desk stays paper-only.

## How to run the mainnet smoke test

You need a wallet with a small amount of ETH for gas and USDC (for a buy) or the B20 token (for a sell). Tiny size only:

```bash
BASE_RPC_URL=https://mainnet.base.org \
TEST_WALLET_PRIVATE_KEY=0x... \
TEST_WALLET_ADDRESS=0x... \
npx tsx scripts/test-aerodrome-swap.ts
```

This fetches a real quote, approves if needed, and executes the swap. Watch the BaseScan link it prints.

## Mainnet smoke-test result

| Field | Value |
|-------|-------|
| Instrument | GOOGLc |
| Side | buy |
| Input | 0.10 USDC |
| Output | 0.00030199 GOOGLc |
| Tx hash | `0x4877…3bf8775` |
| Wallet | `0x7c57…d64b` |
| Router | `0x698C…3A92F` |
| Outcome | `filled` |

## Known gotchas fixed during the sprint

1. **ERC-20 ABI shape.** `viem` `readContract` requires a parsed `Abi`, not a `string[]`. `lib/trading/execute-swap.ts` now uses `parseAbi([...])`.
2. **Wrong router for the verified pools.** The legacy `0xBE6D…` SlipStream router defaults to the initial CL factory. The four verified stock pools live on the newest CL2 factory, so swaps through the legacy router revert. The active router is `0x698C…`.
3. **Privy app secret exposure.** `NEXT_PUBLIC_PRIVY_CLIENT_ID` must not be the app secret. The app secret is server-only and should never be `NEXT_PUBLIC_`. The client only needs `NEXT_PUBLIC_PRIVY_APP_ID` (and an optional real client ID if you have one).

## Files that changed

- `lib/base-chain.ts` — active `AERODROME_SWAP_ROUTER` set to the CL2 Gauges V3 router.
- `lib/trading/catalog.ts` — `getInstrumentAndPairByPoolAddress` helper.
- `lib/trading/aerodrome-router.ts` — new swap/approve call builder.
- `tests/aerodrome-router.test.ts` — new unit tests.
- `lib/trading/execute-swap.ts` — live execution flow, gas estimation, parsed ERC-20 ABI.
- `lib/trading/useDeskExecution.ts` — new React hook.
- `components/auth/AuthProvider.tsx` / `PrivyBackedAuth.tsx` — `sendTransaction` exposure.
- `lib/trading/domain.ts` — `LIVE_ASSUMPTIONS` and `LIVE_EXECUTION_ENABLED` gate.
- `lib/trading/quotes.ts` — live assumptions when gate is on.
- `lib/trading/workflow.ts` — accepts both paper and live assumptions in the schema.
- `components/desk/TradeTicket.tsx` / `WorkingDesk.tsx` / `WorkingDesk.module.css` — live execution UI, banner, stamp, gas display.
- `scripts/test-aerodrome-swap.ts` — manual mainnet test.

## Original state of the foundation

- Quotes already read from Aerodrome Slipstream on Base mainnet.
- Four instruments are configured with verified pool addresses.
- `QuoteEstimate` carries everything needed to build a transaction: `poolAddress`, `instrumentAddress`, `inputSymbol`, `outputSymbol`, `amountInRaw`, `amountOutRaw`, `tokenDecimals`, `quotedAt`, `expiresAt`.
- Wallet auth is already via Privy; `useDeskAuth().walletAddress` exists.
- Eligibility check (`/api/eligibility`) already exists.

## Success criteria

- [x] Real quote from Base mainnet.
- [x] Wallet connects and shows address.
- [ ] Eligibility check passes for the test wallet (run `/api/eligibility?address=0x...`) — not yet verified.
- [x] USDC approval is client-signed and confirmed.
- [x] Swap is client-signed and confirmed on Base mainnet.
- [x] Tx hash is shown and verifiable on basescan.org.
- [x] UI clearly says “live” vs “paper.”
- [ ] Loom demo records the entire flow end-to-end.

## What to avoid

- Do not build a server-side signer that holds private keys. That is a security incident waiting to happen and disqualifies the submission.
- Do not skip the `approve` step or hide it from the user.
- Do not remove the paper mode. The submission may still be judged on the paper flow.
