---
service_chittyid: "TBD-pending-canonical-mint"
service_name: "chittyid"
canonical_uri: "chittycanon://core/services/chittyid"
pentad_version: "0.1.0"
required_for_tier: 0
last_reviewed: "2026-05-26"
next_review_due: "2026-08-26"
---

# ChittyID — Threat Model

Tier 0 service: identity-of-record for the ChittyOS ecosystem. Compromise here is catastrophic.

## 1. STRIDE table

| Threat | Attack vector | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **Spoofing** | Forged X-ChittyOS-Agent-ChittyID with valid-looking token | M | C | Token signature validation; cross-check against ChittyTrust |
| **Tampering** | DB-direct UPDATE on identities table | L | C | CHECK constraints; chitty_id immutable; ledger reconciliation |
| **Repudiation** | Agent denies a mint they performed | M | H | Every mint → ChittyLedger entry; agent ChittyID + signature stored |
| **Information Disclosure** | Resolve query reveals P/Natural PII | M | C | Tier-class enforcement; resolve queries sampled; P/Natural privileged-only |
| **DoS** | High-volume mint requests exhaust sequence space | M | H | Rate limits; sequence pre-allocation; jurisdiction-scoped sequences |
| **Elevation of privilege** | basic agent achieves mint capability | L | C | Token claim validation; mint requires explicit `chittyid:mint` claim |

## 2. Abuse cases

### AC-1: Mint storm with valid token
- **Adversary**: compromised service token holder
- **Assumptions**: token valid; service token theft post-rotation gap
- **Path**: rapid mint of disposable IDs to exhaust jurisdiction sequence space
- **Damage**: sequence exhaustion blocks legitimate mints; ledger noise
- **Detection**: ChittyMonitor mint-rate threshold; ChittyTrust anomaly score

### AC-2: Sequence collision attack
- **Adversary**: two parallel mint requests racing for same sequence
- **Assumptions**: insufficient serialization in mint path
- **Path**: simultaneous mint API calls
- **Damage**: two ChittyIDs share sequence → checksum still validates → identity confusion
- **Detection**: ledger reconciliation finds duplicate sequence

### AC-3: Resolve enumeration
- **Adversary**: basic-class agent trying to walk the ChittyID space
- **Assumptions**: predictable jurisdiction codes + sequence numbers
- **Path**: iterate `01-1-USA-0001 → 01-1-USA-9999` resolving each
- **Damage**: PII disclosure if any resolve returns privileged data
- **Detection**: per-agent resolve-rate threshold; rolling window denial

### AC-4: Backdoor mint via parent_id chain
- **Adversary**: trusted agent
- **Assumptions**: parent_id field accepts any valid existing ChittyID
- **Path**: mint a child of a high-trust parent to inherit reputation
- **Damage**: trust-score laundering
- **Detection**: trust-score recalculation on parent change

## 3. Mitigations

| Threat | Mitigation | Implementation status |
|---|---|---|
| Spoofing | Token signature check | implemented |
| Tampering | Append-only DDL + CHECK | partial (per F-052 — chitty_id PK fix needed) |
| Repudiation | Ledger entry per mint | partial (per F-054 — ledger underused) |
| Info Disclosure | Tier authz | implemented |
| DoS | Rate limits | partial; needs per-jurisdiction limit |
| Sequence collision | Atomic sequence allocation | implemented |
| Enumeration | Per-agent rate limit + denial | needed |
| Trust laundering | Reputation isolation in parent chain | needed |

## 4. Residual risk

- **Token theft during rotation window**: cannot fully eliminate; mitigation is short rotation interval (90-day) and revocation on compromise detection.
- **Insider threat from governance class**: ungated; relies on multi-person review for revocations.

## 5. Review cadence

- **Next review**: 2026-08-26 (90-day Tier 0 cadence)
- **Reviewer**: ChittyFoundation security council
- **Triggers for ad-hoc review**:
  - new endpoint exposed
  - new dependency added
  - severity-P0 incident
  - F-038 / F-041 / F-052 fully closed (triggers revalidation)
