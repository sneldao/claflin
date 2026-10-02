# Eligibility & venue compliance — house policy

**Status:** living policy. Written 2026-10-01 after the Robinhood Chain venue spike showed that every desk's product class is a restricted tokenized security — and that restriction is enforced nowhere onchain. This document owns the house's posture; per-desk docs own mechanics.

## The structural fact

Every product the house covers is a security-like instrument whose legal restrictions live **entirely off-chain**. The tokens themselves are unrestricted (Robinhood stock tokens are plain ERC-20s; anyone can hold, transfer, or deposit them). So whoever provides *access* owns the restriction — there is no chain-level safety net. Each venue in the ecosystem has already made its own product-layer decision:

| Venue/provider | Product-layer decision |
|---|---|
| 0x (aggregator) | Refuses all stock tokens outright — `NOT_AUTHORIZED_FOR_TRADE` both directions, "legal restrictions." Verified live on 4663 with our own key, 2026-10-01. A well-resourced provider decided the class isn't worth it for a permissionless surface. |
| Lighter (RH domain) | Runs a curated instance — venue owns the eligibility posture for its books. Reads (books, marks) are public; order placement is a Lighter account relationship. |
| Robinhood (issuer) | KYB for mint/burn participants; its own regulated app for retail. |
| Coinbase | Onchain EAS attestations (Verified Account + Verified Country) — the only issuer that publishes a verifiable eligibility signal we can read. |
| Backed | Issuer terms only; no onchain attestation exists to read. |

**House rule:** eligibility is our product's policy surface, never the chain's. We decide who the desk serves; we never lean on "the venue allowed it" as a compliance answer, and we never describe a check as stronger than it is.

## Per-desk posture

| Desk / mandate | Instrument class | Issuer restriction | What exists today |
|---|---|---|---|
| Hetty — Coinbase Tokenized Stocks, Base | B20 tokenized stock | Coinbase terms; non-US verification | `lib/eligibility.ts` + `/api/eligibility` — onchain EAS check (Verified Account + non-US Verified Country). When `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED` arms live settle, the ticket gates on it **fail-closed**: missing, unreadable or restricted attestations all refuse execution. A Coinbase-scoped self-declaration (`claflin.eligibility.v1.coinbase-tokenized-stocks`) is also required — it affirms the terms; it never substitutes for the onchain signal. The gate is enforced again inside the execution hook, not just on the buttons. |
| Jesse — Backed xStocks, Solana | Token-2022 tracker certificate | Not offered to US persons; not available to UK retail; sanctioned jurisdictions excluded | `lib/desk/eligibility.ts` — client self-attestation, browser-stored, honestly labelled a self-declaration. No onchain signal exists. |
| Isabel — Robinhood Stock Tokens, 4663 | ERC-20 debt security (Robinhood Assets, Jersey) | US-person restrictions apply | Paper/marks only. No eligibility surface — none is needed until a live flag exists. |
| Jay Cooke — Arbitrum | Unverified | Unverified | Nothing; mandate pending. |
| Halley — Meteora (proposal) | Would touch new issuance-adjacent surfaces | Separate analysis required | Proposal only; venue-not-issuer line stands. |

## Rules that follow

1. **Paper surfaces carry no eligibility chrome.** Marks, estimates, and paper records are market-data and simulation surfaces — displaying them creates no dealing exposure. Adding gate chrome to a demo surface is worse than useless: it implies a control that isn't real.
2. **No live flag without an eligibility surface.** Before any desk accepts a live order in these instruments, that desk must gate on something honest — onchain attestation where the issuer publishes one (Base/Coinbase), explicit per-instrument self-attestation elsewhere (Jesse's model), or a venue-owned eligibility relationship (Lighter). "The venue allowed it" is not an eligibility check.
3. **Attestations stay honest.** A self-declaration is labelled a self-declaration; an onchain attestation is labelled with its issuer and revocation posture; neither is presented as a legal determination. Attestation records are scoped per issuer — `claflin.eligibility.v1.<scope>` — so confirming Coinbase's terms never satisfies Backed's or vice versa.
4. **Aggregator refusals inform, not decide.** 0x refuses the whole class because it cannot gate users; we can gate users per-desk. Their refusal is evidence about the risk class — a live Isabel flag is a business/legal commitment requiring real review, not a deploy flag. ROADMAP §3's "product/access/compliance and security review for the selected products, users, venues and limits" is the gate; it must answer the broker-status question with counsel before any securities order routing.
5. **Venue order placement is a relationship, not a read.** Public reads (books, marks, feeds) are fine for estimates and tape. Order placement (Lighter account, Rialto integrator onboarding, direct mint/burn KYB) is a per-venue eligibility decision the user owns — the house may prepare and route, but account eligibility is never assumed from a successful quote read.
6. **Market-data dependency is noted, not hidden.** Robinhood's `rhj/` endpoints are undocumented public APIs. Fine for the demo window; a shipping product should hold a developer relationship or a documented fallback before treating them as load-bearing.
