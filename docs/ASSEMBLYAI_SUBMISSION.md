# AssemblyAI Voice Agent Hackathon: submission pack

**Deadline:** Wed 30 September 2026, 15:00 UTC (lablab.ai). **Date:** 2026-09-24.
**TL;DR:** Claflin is a voice-first brokerage for tokenized US stocks that trade onchain while NYSE is closed. For this hackathon, Jesse's line runs on **AssemblyAI's Voice Agent API**, where the protocol's own features carry the house's safety rules: progressive tool reveal, `hold` execution, JSON-Schema amount checks, and `reply.done`-ordered tool results. It is the same product as the Stocklana entry; this pack says plainly which parts are new.

## URLs

| What | URL |
|---|---|
| Hosted demo (AssemblyAI line) | `https://claflin.trustfall.xyz/?desk=jesse&view=room&line=assemblyai` |
| Landing (hold-to-talk house line) | `https://claflin.trustfall.xyz/` |
| Public repo (MIT) | `https://github.com/sneldao/claflin` |
| Technical notes | [docs/ASSEMBLYAI_VOICE_AGENT.md](ASSEMBLYAI_VOICE_AGENT.md) |

Do not submit the bare Stocklana URL here. Without `&line=assemblyai`, Jesse rings on ElevenLabs.

## Form copy

**Title:** Claflin: the broker's line for markets that never close

**Short description (≤ 255):**
> Ring an AI broker, say the trade, and watch the slip write itself. Claflin runs on AssemblyAI's Voice Agent API. Filing paper doesn't exist as a tool until a live quote is in review, and nothing moves without your signature.

**Long description:**
> Tokenized US stocks trade onchain around the clock, but the tools for them look like crypto exchanges. Claflin is a voice-first brokerage house instead. You pick up a line, say "buy a hundred dollars of Apple", and an AI broker writes the order slip as you talk, prices it on a real venue (Jupiter on Solana), reads it back, and files a paper record only when you say so.
>
> Jesse, the Solana desk's broker, runs on AssemblyAI's Voice Agent API. The browser gets a single-use token from our server, opens the Voice Agent WebSocket, and sends one `session.update` with the prompt, voice, key terms (AAPLx, NVDAx, USDC, Jupiter…) and ten client-side function tools. Those tools act on the same desk the caller can see and edit by hand.
>
> We used the protocol to make the agent safe by construction, not by prompt:
> - **Progressive tool reveal.** `record_paper` is not registered until a quotation is actually in review. Every time the document on the desk changes, we re-send `session.update` with the tools for that state. The model can't file what it can't call, and the browser refuses anyway if a call races the reveal.
> - **Hold mode for the consequential step.** Filing runs in `hold`, so the broker goes quiet until the browser has written or refused the record.
> - **JSON-Schema hints.** A spoken amount that isn't a plain positive number is re-asked by the agent before our tool ever sees it.
> - **Ordered tool results.** Results are sent only when `reply.done` is the latest event, and a barge-in drops stale ones.
> - **Paper only.** No tool signs, submits or touches a wallet. Live settlement exists behind separate flags and always needs the caller's own wallet signature.
>
> The landing page is a working dealer turret. You hold Space (or press and hold) and speak, AssemblyAI transcribes the instruction, and lamps light on each desk that carries that exact product. When Apple exists on both Base and Solana, the house names both and you choose. It never swaps one rail for another.

**Tags:** AssemblyAI, Voice Agent API, Universal-3 Pro, fintech, tokenized stocks, Solana, Jupiter, Next.js

## Prior work (be explicit)

Claflin existed before September: the repo started 2026-02-09, and the Base desk (Hetty, ElevenLabs) came before this hackathon. Built during the window (Sep 1–30), 189 commits:
- AssemblyAI Dictation on the ticket and the landing-page house line (from 2026-09-12)
- **Jesse on the AssemblyAI Voice Agent API** (2026-09-24): token route, browser session and audio worklets, progressive tool reveal, hold-mode filing, `reply.done`-ordered results, and a provider flag
- The Solana desk itself (Jesse, xStocks, Jupiter quotes, paper records). This is shared with the Stocklana entry.
- The landing page: the dealer turret, a board with a source for every number, and straight answers

## Video (target 2:30)

| t | Shot | Say |
|---|---|---|
| 0:00 | Landing page after NYSE close: "The floor is dark. The line is open." | "Tokenized stocks trade all night. Claflin is the broker's line for that market." |
| 0:15 | Hold Space: "buy Apple for a hundred dollars" → both lamps light, and the page names AAPLc and AAPLx | "It never picks a chain for you. Same company, two products." |
| 0:35 | Open Jesse (`&line=assemblyai`), ring | "Jesse runs on AssemblyAI's Voice Agent API." |
| 0:45 | "Put a hundred dollars of Tesla on the ticket": the slip fills field by field | Point at "from the call" on each field |
| 1:05 | "Price it" → Jupiter estimate with a countdown | "A real venue quote that expires." |
| 1:20 | **Before the quote:** "file it" → Jesse says there is nothing in review | "Filing doesn't exist as a tool until there's a quote. That's progressive tool reveal." |
| 1:40 | "File the paper record" → silence (hold), stamp | "Hold mode: he waits for the browser to write it." |
| 1:55 | Interrupt Jesse mid-sentence | "Barge-in drops stale results." |
| 2:10 | Board row: mint, "tracker certificate", "not for US persons" | "Every number and every product fact is sourced." |
| 2:25 | End card: repo, MIT, AssemblyAI | — |

## Slides (6)

1. Problem: the stock exchange closes, but the onchain book doesn't. There's no broker for that market.
2. Product: the dealer turret, the slip, the board.
3. Architecture: token route → WebSocket → `session.update` → client tools → desk controller.
4. Safety by protocol: reveal, hold, schema, ordering. Use the table in the technical doc.
5. Evidence: the live round trip, and 18 protocol tests.
6. Next steps: Realtime STT on the landing line, Hetty on AssemblyAI, and a phone number over Twilio SIP.

## Checklist

- [x] MIT `LICENSE` at the repo root, and `"license": "MIT"` in `package.json`
- [x] Public GitHub repo
- [x] Voice Agent API integration with client-side tools, verified against the live API
- [ ] Push `main` and deploy with `ASSEMBLYAI_API_KEY` set on the server
- [ ] A real-microphone call at the hosted URL (Chrome, then Safari)
- [ ] Record the video, make the slides and a cover image
- [ ] Submit on lablab.ai before **Sep 30, 15:00 UTC**
