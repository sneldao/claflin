# Jesse market evidence — Pyth Pro verification handoff

E2 work item 1 output, per `docs/STOCKLANA_BUILD_PLAN.md` §4.4 and the
Engineer-2 work order. Last verified: **2026-09-17**.

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
  price was *generated*. Since 2026-03-23 a feed carries its last price
  forward off-hours: when `feedUpdateTimestamp` < the envelope
  `timestampUs`, the price is carried, not fresh. Freshness decisions use
  `feedUpdateTimestamp`, never the envelope time.
- Actual price = `price × 10^exponent`.
- Delivery: JSON, `fixed_rate@1000ms`, `formats: []` (offchain
  presentation; no onchain signature claim is made).

## Unit basis — NOT yet verified (blocker, tracked)

The symbology metadata does not state whether the xStock token feeds
price USD per **raw token** or per **scaled (displayed) unit**, and no
public Pyth doc answers it. Per §4.4 rule 1, the comparison is
unavailable until the basis is proven. Verification procedure (runs in
the ingestion daemon once Pyth Pro credentials land):

1. Observe token `Pt_feed`, equity `Pe`, and redemption rate `R` for the
   same instrument over a regular-session window.
2. If `Pt_feed ≈ Pe` (within tolerance) persistently, the feed is per
   scaled/displayed unit → `tokenUnitBasis = 'usd-per-scaled-token'`.
3. If `Pt_feed ≈ Pe × R` persistently, it is per raw token →
   `tokenUnitBasis = 'usd-per-raw-token'` and normalization divides by
   the multiplier effective at the token price's generation time.
4. If neither holds, the basis stays unverified and comparisons stay
   unavailable. The outcome is written into the feed mapping with its
   evidence; a ticker similarity is never treated as proof.

## Access / entitlement status

- No Pyth Pro API key is provisioned in this environment as of
  2026-09-17 (`PYTH_PRO_API_KEY` expected by the daemon; see
  `scripts/jesse-pyth-feed.ts` when it lands).
- Until then the desk ingests captured fixtures only, and the comparison
  API reports `unavailable` — never a synthetic success (plan line:
  "hide numerical comparison and disclose blocker").
- Display/retention terms for Pyth Pro data still need a terms check by
  the lead before public display of numerical comparisons.

## Sources

- Symbology: https://pyth.dourolabs.app/v1/symbols (2026-09-17)
- Payload reference: https://docs.pyth.network/price-feeds/pro/payload-reference (2026-09-17)
- Feed-id discovery doc: https://docs.pyth.network/price-feeds/pro/price-feed-ids (2026-09-17)
- xStock mint/identity provenance: `lib/solana/catalog.ts` (issuer API +
  mainnet RPC, 2026-09-17)
