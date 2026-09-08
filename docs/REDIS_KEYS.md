# Redis Key Naming Conventions

The anonymous paper desk does not use Redis. Account-tier paper backup and
transcript write do. Everything under **Retained marketplace keys** is
historical source, not a current product store.

## Current desk keys

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `paper:{userId}` | JSON array | none | Account-bound paper records (schema-validated, max 100). Local browser storage stays authoritative; this is a best-effort copy. Deletes are not propagated. |
| `transcript:{userId}:{conversationId}` | JSON object | 30 days | Write-only Hetty call transcript. No client GET. |
| `transcripts:{userId}` | Set | none | Conversation ids stored for that account. No expiry companion to the transcript TTL — treat as a known gap. |

These JSON blobs are intentional. Do not rewrite them as hashes without a
migration. In-process rate limits for quotes and Hetty sessions are not
Redis keys.

## Naming rules (new keys)

1. **Namespace prefix** — every key starts with a domain namespace (`paper:`, `transcript:`, or a retained prefix).
2. **Colon separator** — segments separated by `:`, never dots or slashes
3. **Entity ID** — append the entity ID after the namespace
4. **TTL** — ephemeral keys (transcripts, rate limits, signal sessions) must have a TTL
5. Prefer hashes for new structured records; the desk keys above are the documented JSON exception

## Retained marketplace keys

Not used by the paper desk. Do not create new product features on these.

### Agents

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `agent:{agentId}` | Hash | none | Agent record (name, status, rate, wallet_address, etc.) |
| `agent_index` | Set | none | Set of all agent IDs |
| `agent_index:external` | Set | none | Set of externally-registered agent IDs |
| `agents:online` | Sorted Set | none | Online agents sorted by timestamp |

### Calls

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `call:{callId}` | Hash | none | Call record (agentId, caller, status, cost, duration) |
| `call_index:all` | Set | none | Set of all call IDs |
| `call_index:{callerAddress}` | Set | none | Calls by a specific caller |

### Payments

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `payment-session:{sessionId}` | Hash | none | x402 billing session (agentId, userAddress, secondsBilled, totalCost) |
| `payment_session_index` | Set | none | Set of all payment session IDs |
| `payment-ledger:{callId}` | Hash | none | Billing ledger entry for a call |
| `payment-receipt:{callId}` | Hash | none | On-chain settlement receipt (txHash, amount, blockNumber) |
| `payment_receipt_index` | Set | none | Set of all receipt callIds |
| `split-payment:{callId}` | Hash | none | 80/20 split ledger (agentAmount, platformAmount) |
| `settlement:{callId}` | Hash | none | Settlement tracking record (txHash, from, to, amount) |
| `payouts:{agentId}` | List | none | Pending payout records for an agent |

### Rate limiting

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `ratelimit:api:{identifier}` | String (JSON) | windowMs | Generic API rate limit counter |
| `ratelimit:auth:{identifier}` | String (JSON) | 15min | Auth attempt rate limit |
| `ratelimit:sensitive:{identifier}` | String (JSON) | 1hr | Sensitive action rate limit |
| `ratelimit:ratings:read:{ip}` | String (JSON) | 1min | Ratings read rate limit |
| `ratelimit:ratings:write:{ip}` | String (JSON) | 1min | Ratings write rate limit |
| `ratelimit:register:{ip}` | String (counter) | 1hr | Agent registration rate limit |

### Users

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `user:{userId}` | Hash | none | User record |
| `user:by:address:{address}` | String | none | Lookup: wallet address → userId |
| `user:{userId}:agents` | Set | none | Agents owned by user |
| `user:{userId}:sessions` | Set | none | Sessions for user |
| `user:{userId}:delegations` | Set | none | Delegations for user |

### Sessions

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `session:{sessionId}` | Hash | none | Session record |
| `session_index:all` | Set | none | Set of all session IDs |
| `signal_session:{callId}` | Hash | 60s | WebRTC signal session (ephemeral) |

### Delegations

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `delegation:{delegationId}` | Hash | none | ERC-8004 delegation record |

### Transcripts (legacy webhook / SSE path — dormant)

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `transcript:{conversationId}` | List | none | Legacy webhook transcript messages (capped at 200). Distinct from `transcript:{userId}:{conversationId}`. |
| `transcript:{conversationId}` | Pub/Sub | — | Real-time transcript channel for the old SSE path |

### Events

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `events:list` | List | none | System event log (capped at 1000) |
| `events:summary` | Hash | none | Event counters by type |

### Agent SDK

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `apikey:{apiKey}` | String | none | API key → agentId mapping |
| `verification:{agentId}` | String | TTL | Verification token for agent registration |

## Adding a new key

1. Check this document for an existing namespace
2. Use the pattern `{namespace}:{id}` or `{namespace}_index` for collections
3. Add the key to the table above
4. Set a TTL if the key is ephemeral
5. Prefer `hset`/`hgetall` for new structured records; desk `paper:` / `transcript:` keys are the documented JSON exception
