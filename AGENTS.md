---
service_chittyid: "TBD-pending-canonical-mint"
service_name: "chittyid"
canonical_uri: "chittycanon://core/services/chitty-id"
pentad_version: "0.1.0"
---

# ChittyID — Agents

How AI agents may interact with ChittyID.

## 1. Agent identity verification

Every agent call to ChittyID MUST present:
1. `X-ChittyOS-Agent-ChittyID` header — agent's ChittyID (canonical format per SOP-012)
2. `X-ChittyOS-API-Key` — ChittyAuth-issued service token
3. Token signature validated against ChittyTrust on every call

## 2. Eligible operations

| Operation | Read-only? | Required eligibility class | Evidence routing? |
|---|---|---|---|
| `POST /api/v1/mint` | no | trusted (specific `chittyid:mint` claim) | YES — ledger always |
| `GET /api/v1/validate/{id}` | yes | basic | no |
| `GET /api/v1/resolve/{id}` | yes | trusted | no |
| `POST /api/v1/admin/revoke` | no | governance | YES — ledger + audit |
| `POST /api/supersession/mint` | no | service principal | KV authority manifest only; ChittyMint emits the cryptographic mint audit |
| `POST /api/supersession/verify` | yes | public | no mutation; authority verification only |

## 3. Evidence routing

Ordinary `/api/v1/mint` operations are evidence-grade under the existing mint contract:
- Agent ChittyID is logged as the `mint_requester` field.
- ChittyLedger entry `E/ChittyIDMinted` records action + agent + minted ID.
- Per SOP-110, this applies to the ordinary ChittyID mint surface.

Supersession is a service-to-service continuity exception. `/api/supersession/mint` authenticates the canonical service principal, records the canonical relation in existing ChittyID KV, and re-verifies the cryptographic proof through ChittyMint. It does not currently add a second ChittyLedger write or a requester-agent field; ChittyMint records the underlying supersession mint/reuse audit.

## 4. Identity-first rules

- Ordinary `/api/v1/mint` requires verified agent identity. `/api/supersession/mint` is the explicit service-principal exception for governed legacy continuity; it is not anonymous.
- Entity codes are canonical `P/L/T/E/A`; `T` means Thing and `A` means Authority
- Cannot self-mint (an agent cannot mint its own ChittyID; bootstrapped by governance)
- All resolve queries logged at sample rate; full resolve of P/Natural records requires evidence-grade

## 5. Supersession continuity invariants

- ChittyID owns the canonical predecessor→successor identity relation.
- ChittyMint signs/verifies the cryptographic proof; its HMAC key is never shared with ChittyID or callers.
- `POST /api/supersession/mint` is service-authenticated and currently restricted to governed legacy `T → P` continuity migration.
- `POST /api/supersession/verify` is public/read-only and must re-verify the stored proof through ChittyMint.
- Canonical manifests are indexed by predecessor, successor, and audit ID in existing ChittyID KV; no new schema or identity table is introduced.
- Never rewrite the predecessor ChittyID in place. A proof authorizes the relation; downstream record migration is a separate controlled action.
- ChittyMint is the predecessor-scoped exactly-once birth authority: retries/concurrent requests for the same predecessor return the same successor/proof. ChittyID projects that proof into its canonical KV relation indexes; it does not implement a second mint lock.

## 6. Disallowed actions

- Direct DB writes to identity tables (must go through API)
- Editing `chitty_id` of any existing row (immutable per SOP-040)
- Issuing ChittyAuth tokens (ChittyID is consumer, not issuer)
- Backdating ledger entries

## 7. Rate limits / quotas

| Tier | Mints/hour | Resolves/min | Notes |
|---|---|---|---|
| basic | 0 | 60 | validate only |
| trusted | 100 | 600 | normal services |
| governance | unlimited | unlimited | audit-heavy |

Quotas enforced by ChittyAuth at token issuance.
