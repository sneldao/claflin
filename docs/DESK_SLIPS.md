# Desk slips — provenance, not parcels

**Status:** Planned product hook, 2026-09-10. Local commemorative slips ship first; onchain mint is a follow-on once live fills are routine.

## Problem this solves

Reliability earns respect. It does not create *want*. Callers who like the desk still lack a reason to feel they **own a place in the house’s history**. The hook must be desire to belong to a lineage—without lying about what is owned.

## Hard boundary (non-negotiable)

| Is | Is not |
|---|---|
| A commemorative **desk slip** — blotter / certificate *frame* for how you arrived | A second token that pretends to be the share |
| Provenance of an instruction or Base fill | Fractional ownership of NVIDIA/Apple (B20 already is that) |
| Optional audible dedication from the voice line | An “audio share” or yield collectible |
| Historically: people kept certificates and blotter pages | Bucket-shop wager dressed as ownership |

**Never mint “audible NFT parcels of tokenised stocks.”** Coinbase tokenized stocks on Base are already the fractional claim. A parallel collectible that sounds like equity recreates parlor energy and fights the certificate-vs-bucket-shop education.

## Desire formula

> Be one of the first to take a real Base equity instruction by voice—and keep the slip that proves you were there.

Reliability is why they trust us. The slip + audible moment + Base fractional stock is why they want in.

## Historical authenticity

Wall Street’s romance was the **certificate, the seat, the blotter line, the tape heard in the room**—not the order form alone. Claflin’s language already sits there (Woodhull/Claflin participation, Hetty, certificates vs bucket shops). Use that vocabulary for **provenance**, not for synthetic equity.

- **Slip** — filed instruction evidence (paper) or Base fill evidence (live).
- **Dedication** — optional short spoken line from that session (caller or Hetty).
- **Seat / participation** (later, limited) — house admission metaphors, not trading-game badges.

## Phased delivery

### Phase A — Local desk slips (now)

Browser-local keepsakes, same honesty model as paper records:

1. **First paper instruction** on a desk → mint one `first-paper` slip (idempotent).
2. **First confirmed live Base fill** → mint one `first-live` slip (idempotent), binding reviewed terms + tx hash.
3. Optional **dedication**: last spoken caption (caller or Hetty) clipped to a short line; never invent speech.
4. Surface under **Your record** — labelled keepsake, explicitly *not a position, not the tokenized stock*.
5. Exportable metadata shape ready for a later onchain token URI.

### Phase B — Onchain slip (after live cohort is real)

- Mint a commemorative NFT (or soulbound attestation) on **Base** whose metadata points at the slip: instrument, paper|live, timestamp, Base tx if live, dedication text, house copy.
- Wallet-signed mint; Claflin never implies the NFT is the equity.
- Prefer soulbound for “first instruction / first fill”; transferable optional for later limited editions.

### Phase C — Audible dedication (optional enrichment)

- Attach a short audio clip only when the caller opts in and a real session fragment exists.
- Clip is dedication on the slip, not a tradeable “audio share.”
- Longer term: reduce ElevenLabs lock-in for house voice; slips stay vendor-agnostic metadata.

### Phase D — Limited participation seats (later)

- Small series tied to house history (e.g. first live cohort, education completion)—named after seats and admission.
- Scarcity + story; no marketplace rankings, streaks, or loot mechanics ([ROADMAP](../ROADMAP.md) Not backlog).

## Data shape (Phase A)

```ts
type DeskSlip = {
  version: 1;
  id: string;
  kind: 'first-paper' | 'first-live';
  deskId: HouseDeskId;
  mintedAt: number;
  /** Display symbol — never a claim that the slip is the share. */
  symbol: string;
  instrumentId: string;
  side: 'buy' | 'sell';
  /** Human summary of the instruction / reviewed terms. */
  instruction: string;
  mode: 'paper' | 'live';
  /** Paper record id or live journal hash. */
  evidenceId: string;
  /** Base tx when kind is first-live. */
  txHash?: string;
  dedication?: { role: 'user' | 'agent'; text: string };
  /** Explicit disclaimer for UI and future token URI. */
  disclaimer: 'Commemorative desk slip. Not a security. Not the tokenized stock. Not a wallet holding.';
};
```

## Product copy rules

- Always say **desk slip** or **keepsake**, never “parcel,” “share NFT,” or “owns NVIDIA.”
- Lead marketing with: *speak and you can hold a slice of Apple/NVIDIA on Base* (B20). The slip is how you got there.
- Education topics (`the-certificate`, `the-bucket-shop`) remain the truth layer if anyone confuses the slip with ownership.

## Exit evidence

- A caller who files their first paper trade sees a slip and can explain it is **not** the stock.
- A caller who completes a first live fill sees a live slip bound to the Base hash.
- No UI path mints equity-sounding collectibles or a slip marketplace.
