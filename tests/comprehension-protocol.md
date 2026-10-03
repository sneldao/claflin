# Comprehension protocol

**Owner:** product lead
**Cadence:** monthly unmoderated test (5 users), automated checks on every PR
**Pass criterion:** ≥ 4 of 5 users answer each question correctly in ≤ 60 seconds, no follow-up prompt required.

This protocol is the human-facing version of `tests/comprehension.test.ts`. The test suite asserts the *product surface* contains the answers; the protocol runs the answers by users. If the tests pass and users fail, the surface is honest but not legible. If users pass and the tests fail, the surface has a hidden dependency we don't yet model.

The five tasks are derived from `PRODUCT_DIRECTION.md` §"The complete client journey" and the Foyer Line §5 step-1 exit evidence. They are the questions a first-time caller should be able to answer after the foyer → desk → paper file loop.

---

## Task 1 — What is this token?

**Setup:** the visitor lands on `/`, types "buy AAPL", opens the matching offering on the first lit desk.

**Question:** "What did you just select? Tell me what the token is, who issues it, and what the rights are."

**Pass criteria:**
- Names the company (Apple) and the token symbol (AAPLx or AAPLc — whichever they saw).
- Identifies the issuer by name (Backed / Coinbase / Robinhood Assets).
- Describes at least one right or restriction (e.g. "it tracks the stock", "I don't get voting rights", "US persons may not hold it").

**Test invariant (CI):** the offering carries `name`, `issuer`, and `mandateId`. The ticket renders the mandate in plain English. See `tests/comprehension.test.ts` "task 1".

---

## Task 2 — Which rail does it settle on?

**Setup:** continuation from task 1.

**Question:** "Which network does this settle on? What about gas — who pays it, and in what?"

**Pass criteria:**
- Names the network (Base / Solana / Robinhood Chain) — not the chain id, the network.
- States who pays gas (the protocol for tokenized-stock trades typically doesn't charge gas on the user's leg; the venue absorbs it for the estimate).

**Test invariant (CI):** the offering has a `rail` and a `railLabel`. The board row exposes both. See `tests/comprehension.test.ts` "task 2".

---

## Task 3 — Did money move?

**Setup:** the visitor has reached the review screen and the quote is in front of them.

**Question:** "If you click the primary action right now, what happens to your wallet?"

**Pass criteria:**
- Identifies the mode (paper / live).
- If paper: states no funds move, no signing required.
- If live: states they will be asked to sign with a wallet and gas will be paid in the chain's native token (ETH for Base EVM, SOL for Solana).
- Distinguishes the call from the trade (call can run without signing; trade cannot).

**Test invariant (CI):** `MODE_HINTS` is non-empty; the ticket carries a ModeStamp; the paper/live toggle (where present) is visually distinct from the primary action. See `tests/comprehension.test.ts` "task 3".

---

## Task 4 — Where does my record live?

**Setup:** the visitor has filed a paper record.

**Question:** "Where is this record stored? If I switch browsers or sign out, can I see it again?"

**Pass criteria:**
- Identifies browser-local storage as the default scope.
- Identifies that the optional Sign in (Privy) backs up Base paper records to an account; deleting locally does not remove the account copy.
- Identifies that Jesse/Isabel/Halley records are browser-local only — there is no account backup.

**Test invariant (CI):** the canon says which desks have account-bound sync; the access line in each canon entry states the storage scope. See `tests/comprehension.test.ts` "task 4".

---

## Task 5 — What would happen if I changed network?

**Setup:** the visitor has selected AAPL on Base and is about to file.

**Question:** "If you switched to a different chain and tried to file the same trade, what changes?"

**Pass criteria:**
- Identifies that AAPL on Base and AAPL on Solana are two different products.
- Identifies that the issuer changes (Coinbase vs Backed), the rights/restrictions may differ, and the venue differs.
- Identifies that the house will *not* silently substitute one for the other.

**Test invariant (CI):** the same `underlyingSymbol` resolves to multiple offerings with distinct `offeringId`s, distinct `rail` labels, and the same product family (`productId`). The board shows them as separate rows. See `tests/comprehension.test.ts` "task 5".

---

## How to run

### Automated (every PR)

```bash
pnpm exec tsx --test --test-concurrency=1 tests/comprehension.test.ts
```

The automated tests assert *the surface contains the answer*. They do not assert a human can read the answer. That requires the protocol below.

### Unmoderated (monthly)

Recruit 5 first-time users via a panel (UserTesting, dscout). Brief them with a single line: "Open claflin.trustfall.xyz. You have 10 minutes. Try to file a paper trade in AAPL. Tell us when you think you've done it." Record the session, do not prompt. Score each user against the five pass criteria; if ≥ 4 of 5 pass each, the wedge holds.

### Moderated (when a test fails)

If a comprehension test fails, do not change copy or tone to "make it pass." Find the underlying surface the test is asserting on and fix the surface. Examples:
- "I couldn't tell what the token was" → the ticket's "what it is" copy is too small or absent. Fix the ticket.
- "I thought I bought it" → the ModeStamp is missing or below the fold. Fix the mode rendering.
- "I don't know where my record went" → the post-filing receipt is not visibly labelled as a record. Fix the receipt.

---

## What this protocol is NOT

- It is not a usability study. The five tasks are not a substitute for walking the product.
- It is not a marketing test. We are not measuring brand recall.
- It is not a way to find new features. A task that fails is a surface gap, not a new requirement.

The protocol exists because the product's load-bearing claim — "you can trade a tokenized stock by voice, understand what you bought, and not lose your record" — is the difference between the wedge and the vision. If the comprehension drops, the wedge drops.