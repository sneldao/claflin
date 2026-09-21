# Jesse market evidence — Pyth Pro verification handoff

E2 work item 1 output, per `docs/STOCKLANA_BUILD_PLAN.md` §4.4 and the
Engineer-2 work order. Symbology verified **2026-09-17**. Unit basis
verified from live Lazer samples **2026-09-21** (All Access trial).

## Verified feed mapping

Resolved via the official Pyth Pro symbology API
(`https://pyth.dourolabs.app/v1/symbols`, linked from
https://docs.pyth.network/price-feeds/pro/price-feed-ids). No Core/Hermes
hex ids are used anywhere; the ids below are numeric Pyth Pro (Lazer) ids.

| Instrument | Equity feed (USD/share) | Token feed | Redemption-rate feed |
| --- | --- | --- | --- |
| AAPLx (`sol:XsbE…zJp`) | `922` Equity.US.AAPL/USD | `1792` Crypto.AAPLX/USD | `1791` Crypto.AAPLX/AAPL.RR |
| NVDAx (`sol:Xsc9…qEh`) | `1314` Equity.US.NVDA/USD | `1833` Crypto.NVDAX/USD | `1832` Crypto.NVDAX/NVDA.RR |
| TSLAx (`sol:XsDo…oB`) | `1435` Equity.US.TSLA/USD | `1847` Crypto.TSLAX/USD | `1846` Crypto.TSLAX/TSLA.RR |

The machine-readable source of truth is `lib/solana/market/feeds.ts`.

Symbology metadata observed for all six spot feeds: `state: stable`;
equity feeds are `asset_type: equity`, `instrument_type: spot`,
`exponent: -5`, sessions `regular` (09:30–16:00 America/New_York,
Mon–Fri, exchange holidays closed), `pre_market`, `post_market`,
`over_night`; token feeds are `asset_type: crypto`,
`instrument_type: spot`, `exponent: -8`, 24/7 schedule; redemption-rate
feeds are `asset_type: crypto-redemption-rate`, `instrument_type: rate`,
`exponent: -8`, 24/7.

## Payload contract (verified against the payload reference)

https://docs.pyth.network/price-feeds/pro/payload-reference (2026-09-17):

- Requested properties: `price`, `confidence`, `exponent`,
  `feedUpdateTimestamp`, `marketSession`, `publisherCount`.
- `marketSession` values: `regular`, `preMarket`, `postMarket`,
  `overNight`, `closed` — matches the `MarketObservation.session` enum.
- `feedUpdateTimestamp` is microseconds since epoch and names when the
  price was *generated*. Freshness decisions use `feedUpdateTimestamp`,
  never the envelope time.
- Actual price = `price × 10^exponent`.
- Delivery: JSON, `fixed_rate@1000ms`, `formats: []` (offchain
  presentation; no onchain signature claim is made).

## Unit basis — verified 2026-09-21

Live Lazer samples under All Access trial entitlement showed
`notEntitled: []` for all nine feeds. Observed relationships:

- AAPL / NVDA: `Pt ≈ Pe × R` (redemption rate) within ~3 bps, while
  `|Pt − Pe|/Pe` was larger.
- TSLA: `R = 1`, so both relations coincide.
- RR values matched Backed Scaled UI Amount multipliers for the same
  mints.

Conclusion: token feeds price **USD per raw token** →
`tokenUnitBasis = 'usd-per-raw-token'`. Comparison divides by the mint
multiplier effective at the token price’s generation time (never twice).

## Access / entitlement status

- Trial key entitled **All Access** (excl. 24/7 Pyth Indices) through end
  of trial (Marc Tillement / Pyth, 2026-09-21).
- Daemon: `scripts/jesse-pyth-feed.ts` → Redis keys
  `claflin:jesse:pyth:v1:<feedId>`. Env: `PYTH_PRO_API_KEY` plus Upstash.
- Key is server-side only; never shipped to the browser.
- Public credit: evidence panel links Pyth Pro with Stocklana thanks.

## Sources

- Symbology: https://pyth.dourolabs.app/v1/symbols (2026-09-17)
- Payload reference: https://docs.pyth.network/price-feeds/pro/payload-reference (2026-09-17)
- Feed-id discovery doc: https://docs.pyth.network/price-feeds/pro/price-feed-ids (2026-09-17)
- Subscribe: https://docs.pyth.network/price-feeds/pro/subscribe-to-prices
