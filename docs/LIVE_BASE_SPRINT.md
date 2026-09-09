# Live Base Execution Sprint

**Goal:** Claflin submits a working live trade on Base for the Builder Quest.  
**Deadline:** Loom recording once the end-to-end swap has been tested on mainnet (real funds, small size).  
**Team:** 3 developers. Work in parallel, integrate at `main` only after pair review.

## State of the foundation

- Quotes already read from Aerodrome Slipstream on Base mainnet.
- Four instruments are configured with verified pool addresses.
- `QuoteEstimate` carries everything needed to build a transaction: `poolAddress`, `instrumentAddress`, `inputSymbol`, `outputSymbol`, `amountInRaw`, `amountOutRaw`, `tokenDecimals`, `quotedAt`, `expiresAt`.
- Wallet auth is already via Privy; `useDeskAuth().walletAddress` exists.
- Eligibility check (`/api/eligibility`) already exists.
- **What does not exist:** a verified Aerodrome router address, swap ABIs, allowance handling, client signing, gas estimation, or settlement tracking.

## Must resolve before any code merges

1. **Router contract.** The configured `AERODROME_SWAP_ROUTER` is marked historical/unverified. Somebody must confirm the exact contract address and ABI for the newest Aerodrome Slipstream CL router on Base. Without this, no path is safe.
2. **Test wallet with real USDC.** We need a wallet that has ~$5–$10 of USDC on Base and a small amount of ETH for gas. The swap test should be tiny (e.g., 0.10 USDC → GOOGLc) so losses are negligible if it fails.
3. **Token approvals.** Aerodrome requires ERC-20 `approve` on the input token before the router can spend it. This must be client-signed and must not be hidden.
4. **Slippage + deadline.** Quote output is not guaranteed. A small slippage (e.g., 0.5–1%) and a 2-minute deadline is the minimum.
5. **Error handling.** Failed approvals, reverts, gas underpricing, and RPC drops must show honest copy, not raw errors.

## Parallel tracks

### Track A — Smart-contract / swap path (Owner: 1 dev)

**This is the critical path.** Nothing else matters if the router is wrong.

1. Confirm the current Aerodrome Slipstream `SwapRouter` or `UniversalRouter` address on Base mainnet for the CL2 factory pools.
2. Fetch or build the minimal ABI for:
   - `exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))` or equivalent.
   - `multicall(bytes[] data)` if the router uses it.
   - `quoter` behavior already works; do not touch it.
3. Add the verified router address and ABI to `lib/base-chain.ts` and a new `lib/trading/aerodrome-router.ts`.
4. Write a pure, tested function `buildAerodromeSwapCall(quote, slippageBps, recipient, deadline)` that returns the transaction `to`, `data`, and `value` (0 for ERC-20 → ERC-20).
5. Pair with Track B to test a real swap on Base mainnet with $0.10 USDC.

**Definition of done:** a single real swap succeeds on Base mainnet and returns a tx hash.

### Track B — Client signer + wallet integration (Owner: 1 dev)

1. Extend `useDeskAuth` / Privy to request a wallet signature. Use `viem` or `ethers` with the user's connected wallet.
2. Build `lib/trading/execute-swap.ts`:
   - `prepareSwapTx(quote, slippageBps, walletAddress)` → transaction object.
   - `signAndSend(tx, walletClient)` → broadcasts and returns hash.
   - `waitForReceipt(hash)` → polls Base RPC until `success` or `reverted`.
3. Build `useAllowance(token, spender, owner)` and `approveToken(token, spender, amount, walletClient)`.
4. Add a small “Approve USDC” step that must complete before the swap button is enabled.
5. Add a gas-estimation helper that falls back to a conservative hard-coded limit if `estimateGas` fails.

**Definition of done:** user can connect wallet, approve USDC, sign a swap, and see a tx hash.

### Track C — UI / mode gate + safety copy (Owner: 1 dev)

1. Replace the hard-coded `liveExecutionEnabled: false` with an env-driven gate (`NEXT_PUBLIC_LIVE_EXECUTION_ENABLED=true`).
   - When off, the desk stays exactly as it is now: paper-only.
   - When on, the review slip shows a live “Execute on Base” button alongside the existing “Record paper trade.”
2. Add a prominent live-mode banner:
   - “Live execution is enabled. Real tokens and real USDC will move.”
   - Connected wallet address, Base network, eligibility result.
3. Update `TradeTicket` review stage:
   - Show slippage input (default 0.5%).
   - Show gas estimate.
   - Show “Approve USDC” or “Execute swap” button states.
   - After broadcast, show tx hash + link to basescan.org.
4. Update `outcomes.ts` so live execution produces a `LiveEvidence` with `submitted` / `pending` / `filled` / `failed` labels.
5. Update `PRIVACY` / `assumptions` copy to reflect real execution when live mode is on.

**Definition of done:** the UI clearly distinguishes paper and live modes and surfaces all required safety information.

## Integration order

1. Track A confirms router + ABI (blocks everything).
2. Track A and Track B merge to make one real mainnet swap.
3. Track C merges the UI gate and wires it to Tracks A/B.
4. Run the full flow on a small real amount: quote → approve → execute → record.
5. Only then record the Loom.

## Files to touch

- `lib/base-chain.ts` — verified router + quoter addresses.
- `lib/trading/aerodrome-router.ts` — new.
- `lib/trading/execute-swap.ts` — new.
- `lib/trading/domain.ts` — allow `liveExecutionEnabled: true` and `mode: 'live'`.
- `lib/trading/quotes.ts` — flip mode when live execution is on.
- `lib/trading/workflow.ts` — validate live quote schema.
- `lib/trading/useTradingDesk.ts` — add `execute(quote, slippage)` action.
- `components/desk/TradeTicket.tsx` — live execution UI.
- `components/auth/AuthProvider.tsx` — signer access if needed.
- `app/api/desk/hetty/quote/route.ts` or existing quote route — no server-side signing; keep execution client-side.

## What to avoid

- Do not build a server-side signer that holds private keys. That is a security incident waiting to happen and disqualifies the submission.
- Do not skip the `approve` step or hide it from the user.
- Do not use the unverified `AERODROME_SWAP_ROUTER` without re-verification.
- Do not remove the paper mode. The submission may be judged on the paper flow if live execution is not ready.

## Success criteria

- [ ] Real quote from Base mainnet.
- [ ] Wallet connects and shows address.
- [ ] Eligibility check passes for the test wallet.
- [ ] USDC approval is client-signed and confirmed.
- [ ] Swap is client-signed and confirmed on Base mainnet.
- [ ] Tx hash is shown and verifiable on basescan.org.
- [ ] UI clearly says “live” vs “paper.”
- [ ] Loom demo records the entire flow end-to-end.
