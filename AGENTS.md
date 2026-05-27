---
service_chittyid: "TBD-pending-canonical-mint"
service_name: "chittyid"
canonical_uri: "chittycanon://core/services/chittyid"
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

## 3. Evidence routing

Mint operations are inherently evidence-grade:
- Agent ChittyID logged as `mint_requester` field
- ChittyLedger entry `E/ChittyIDMinted` records action + agent + minted ID
- Per SOP-110, applies to all chittyid mints regardless of caller

## 4. Identity-first rules

- No mint without verified agent ChittyID (no anonymous minting)
- No mint of a `T` (Authority) type without governance-class claim
- Cannot self-mint (an agent cannot mint its own ChittyID; bootstrapped by governance)
- All resolve queries logged at sample rate; full resolve of P/Natural records requires evidence-grade

## 5. Disallowed actions

- Direct DB writes to identity tables (must go through API)
- Editing `chitty_id` of any existing row (immutable per SOP-040)
- Issuing ChittyAuth tokens (ChittyID is consumer, not issuer)
- Backdating ledger entries

## 6. Rate limits / quotas

| Tier | Mints/hour | Resolves/min | Notes |
|---|---|---|---|
| basic | 0 | 60 | validate only |
| trusted | 100 | 600 | normal services |
| governance | unlimited | unlimited | audit-heavy |

Quotas enforced by ChittyAuth at token issuance.
