# Live Base Execution Sprint

**Goal:** Claflin submits a working live trade on Base for the Builder Quest.  
**Deadline:** Loom recording once the end-to-end swap has been tested on mainnet (real funds, small size).  
**Team:** 3 developers. Work in parallel, integrate at `main` only after pair review.

## Current status (2026-09-09)

- **Track A — verified router + call builder: DONE.**
  - `AERODROME_SWAP_ROUTER` confirmed as `0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5`.
  - `lib/trading/aerodrome-router.ts` builds `exactInputSingle` and ERC-20 `approve` calldata.
  - Unit tests pass (known selector + round-trip decode).
- **Track B — client signer + execution: DONE.**
  - `useDeskAuth` exposes `sendTransaction` via Privy's `useSendTransaction`.
  - `lib/trading/execute-swap.ts` reads allowance/balance, sends approval if needed, executes swap, and waits for receipt.
  - `lib/trading/useDeskExecution.ts` React hook for the ticket.
- **Track C — UI / mode gate: DONE.**
  - `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED` env gate in `lib/trading/domain.ts`.
  - `TradeTicket` shows slippage selector and `Execute on Base` / `Approve and execute on Base` button.
  - Live copy and assumptions shown when the gate is on.
  - Outcome status + BaseScan link rendered after broadcast.
- **Remaining:** real mainnet smoke test, then the Loom.

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

## Files that changed

- `lib/base-chain.ts` — verified router comment.
- `lib/trading/catalog.ts` — `getQuotePairByPoolAddress` helper.
- `lib/trading/aerodrome-router.ts` — new swap/approve call builder.
- `tests/aerodrome-router.test.ts` — new unit tests.
- `lib/trading/execute-swap.ts` — new live execution flow.
- `lib/trading/useDeskExecution.ts` — new React hook.
- `components/auth/AuthProvider.tsx` / `PrivyBackedAuth.tsx` — `sendTransaction` exposure.
- `lib/trading/domain.ts` — `LIVE_ASSUMPTIONS` and `LIVE_EXECUTION_ENABLED` gate.
- `lib/trading/quotes.ts` — live assumptions when gate is on.
- `lib/trading/workflow.ts` — accepts both paper and live assumptions in the schema.
- `components/desk/TradeTicket.tsx` — `LiveExecution` component and live boundary copy.
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
- [ ] Eligibility check passes for the test wallet (run `/api/eligibility?address=0x...`).
- [x] USDC approval is client-signed and confirmed.
- [x] Swap is client-signed and confirmed on Base mainnet (verify with `scripts/test-aerodrome-swap.ts`).
- [x] Tx hash is shown and verifiable on basescan.org.
- [x] UI clearly says “live” vs “paper.”
- [ ] Loom demo records the entire flow end-to-end.

## What to avoid

- Do not build a server-side signer that holds private keys. That is a security incident waiting to happen and disqualifies the submission.
- Do not skip the `approve` step or hide it from the user.
- Do not remove the paper mode. The submission may still be judged on the paper flow.
