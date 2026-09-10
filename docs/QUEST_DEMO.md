# Base Builder Quest — Tokenized Stocks demo pack

**Positioning:** Claflin is a neobrokerage desk for Coinbase Tokenized Stocks on Base — voice instruction → live Aerodrome estimate → explicit review → **a real fill on Base mainnet**, with paper mode for practice. Eligible non-US access is stated; nothing is staged or fabricated — the smoke-test fill is on-chain (tx `0x48773aac…8775`, 0.10 USDC → GOOGLc).

**Lane:** Neobrokerages (not memes, indexes, or yield stripping).

## 60-second Loom cut (primary — live execution)

| Time | Beat |
|---|---|
| :00–:05 | **Cold open on the filled trade.** "Ten seconds ago I bought a tokenized share of Alphabet on Base mainnet. Here's the desk that did it." The FILLED stamp or the BaseScan tx is on screen. |
| :05–:10 | One-line frame: "Claflin is a brokerage house for Coinbase Tokenized Stocks on Base. Hetty Green — Wall Street's most feared investor in 1916 — is the broker on duty." |
| :10–:22 | **Ring Hetty, speak the instruction:** "Buy NVIDIA for 25 USDC." The plaque, side and amount flash as she writes them on the ticket. |
| :22–:32 | The estimate lands, the slip scrolls into view, she reads it back. Both voices are captioned on the paper — the dialogue reads with the sound off. |
| :32–:47 | **Execute.** Slippage chip, "Execute on Base," sign in the wallet. USDC approval is done *before* recording; narrate it: "First trade needs a one-time approval — after that it's one click." |
| :47–:56 | FILLED stamp on the ticket, BaseScan link, wallet balance. "Not a simulation — a real swap through Aerodrome on Base mainnet." |
| :56–:60 | Close: "Paper mode to practice, live when you're ready. Built for the Base Builder Quest." |

**Judgment calls:**
- **Pre-approve.** The smoke-test wallet already holds a USDC allowance for the router — the on-camera path is one click. Showing the full 1/2 → 2/2 costs 12–15s; in 60s, choose voice *or* the full two-step, not both. Voice is the differentiator; narrate the two-step.
- **Hetty gets one sentence, not a segment.** The fuller lore lives in the X post, where it costs nothing.
- **Voice is the risk.** Mic permission, line latency, agent availability. Rehearse twice. If the ring fails on take day, enter the ticket manually and keep moving — the demo survives it, the fumble doesn't.
- Quote validity is 30s. After the estimate lands, execute inside the window; if approval runs on camera, the desk re-quotes automatically after it confirms.

## 90-second fallback cut (paper, no wallet needed)

Use when the line, the wallet, or the venue fails on recording day. Paper mode is honest and complete on its own.

| :00–:10 | Open `/` — one door. Point at **Claflin**, the **ticket**, and **paper mode**. The work is first; Hetty Green is the line beside it, not the brand. No marketplace, no wallet bootstrap, no house tour. If Sign in is visible (Privy configured), ignore it — it is not live access. |
| :10–:18 | The tape: live indicative marks, hover to pause, click **NVDAc** — it loads into the ticket. Stale labels show when feeds are quiet; say so honestly. |
| :18–:38 | Spend **25 USDC**, hit **Review estimate**. The ticket is the blotter; do not wait for the receiver to "load in," and do not treat a raised handset as quote state — pickup is reserved for a live line. |
| :38–:56 | **Quotation slip** on the ticket — spend / receive / as-of / review window. Open details once; close. |
| :56–:70 | **Record paper trade** → acknowledge beat (✓ Paper recorded). Nothing onchain. |
| :70–:78 | The **note of the day** under "The pit is downstairs" — one attributed line of house color. Say what it is: an observation from the house, not advice. Live-call variant: ask Hetty for "a thought from the house" — `share_desk_note` speaks the same line verbatim, once per call. |
| :78–:90 | Point at **Filed to your paper ledger** and the ledger line marked just filed. Open it — same record. Close on boundaries + Base Tokenized Stocks. |

Optional 15s: narrow viewport or reduced-motion — ticket still works; the receiver still stays readable. On a phone the note of the day may sit below the fold — skip the :70–:78 beat or scroll to it briefly rather than implying the viewer saw it.

## X post draft (tag @buildonbase)

Hetty Green terrified Wall Street in 1916. Now she answers the phone at Claflin — a house desk for Coinbase Tokenized Stocks on Base.

Voice instruction → live Aerodrome estimate → one-click review → a real fill on Base mainnet. Paper mode for practice. No fake fills.

Loom: [link]
Built for the Base Tokenized Stocks Builder Quest.

## Submit checklist

- [ ] Confirm current quest deadline and terms on the Base form / X thread.
- [ ] Set `NEXT_PUBLIC_LIVE_EXECUTION_ENABLED=true` plus the Privy vars on the deployment used for the recording.
- [ ] Re-provision the voice agent so the dual-mode prompt is live: `node scripts/update-hetty-agent.mjs`.
- [ ] Pre-approve USDC for the router from the demo wallet (the smoke-test wallet already has it) so execution is one click on camera.
- [ ] Set `BASE_RPC_URL` to a reliable Base mainnet endpoint before recording (public `mainnet.base.org` rate-limits and can take >20s mid-demo).
- [ ] Record during US market hours — the tape labels marks STALE when the Chainlink feeds are quiet (weekends/holidays), which is honest but reads less impressively.
- [ ] Deploy or use a stable public URL for the Loom (not only localhost).
- [ ] Rehearse the full arc twice: ring → speak → estimate → execute → FILLED. Warm the quote path once before the take.
- [ ] Post Loom on X tagging @buildonbase.
- [ ] Submit the Google form with project link + Loom.
- [ ] Disclaimer on-screen or spoken: Coinbase-issued tokens; eligible non-US users; not financial advice. Paper records are simulations; the live fill is a real mainnet swap.

## Do not demo

Fake live fills, wallet signing that doesn't exist, marketplace directory, free-call funnel, "live access" or eligibility as a feature, claiming regulated brokerage status, or presenting the note of the day as advice, a signal, or a claim about current markets. Do not let Hetty imply she signed or submitted anything — on a live desk the Execute button is the caller's alone.
