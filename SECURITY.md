---
service_chittyid: "TBD-pending-canonical-mint"
service_name: "chittyid"
canonical_uri: "chittycanon://core/services/chittyid"
pentad_version: "0.1.0"
last_reviewed: "2026-05-26"
next_review_due: "2026-08-26"
---

# ChittyID — Security

## 1. Threat surface

**Exposed endpoints (id.chitty.cc):**
- `POST /api/v1/mint` — mint a new ChittyID (most-privileged operation)
- `GET /api/v1/validate/{chitty_id}` — validate format + checksum (public)
- `GET /api/v1/resolve/{chitty_id}` — resolve to identity record (auth required)
- `GET /health` — liveness (public per SOP-051)
- `POST /api/supersession/mint` — privileged legacy `T → P` identity-continuity relation mint + canonical manifest write
- `POST /api/supersession/verify` — public/read-only canonical relation verification

**Internal endpoints (service-binding):**
- registry sync, trust scoring callbacks

**Trust boundaries:**
- Public ↔ ChittyAuth gateway (token validation)
- ChittyAuth ↔ ChittyID (service token)
- ChittyID ↔ ChittyTrust (signed callback)
- ChittyID ↔ ChittyLedger (mint event recording)
- ChittyID ↔ ChittyMint (authority proof issuance/verification; signing key remains only in ChittyMint)

## 2. Authentication & authorization

- **Authentication**: ChittyAuth-issued service token in `X-ChittyOS-API-Key` header
- **Identity provider**: ChittyAuth (`chittycanon://core/services/chittyauth`)
- **Service tokens**: canonical shared service principal delivered from CF Secrets Store as `CHITTY_AUTH_SERVICE_TOKEN`; legacy ChittyAuth-issued bindings remain for existing routes
- **Per-endpoint authz**:
  | Endpoint | Required role | Source |
  |---|---|---|
  | POST /api/v1/mint | `chittyid:mint` | ChittyAuth claim |
  | GET /api/v1/resolve/* | `chittyid:read` | ChittyAuth claim |
  | POST /api/supersession/mint | canonical service principal | `CHITTY_AUTH_SERVICE_TOKEN` Secrets Store binding |
  | POST /api/supersession/verify | public/read-only | stored ChittyID authority relation + ChittyMint proof verification |

## 3. Data classifications

- **PII**: `display_name`, `legal_name` (in P/Natural records) — handling: ChittyEvidence-grade
- **Identity bindings**: parent_chitty_id graph — handling: PRIVILEGED
- **Format metadata**: sequence numbers, jurisdiction codes — PUBLIC
- **Mint timestamps**: PUBLIC (anchored to ledger)
- **Supersession manifests**: PRIVILEGED identity relationship metadata; verification result may be public/read-only

## 4. Secrets held

| Secret | Purpose | Storage | Rotation | Last rotated |
|---|---|---|---|---|
| `CHITTYAUTH_ISSUED_MINT_API_KEY` | Existing ChittyAuth token validation | CF Secrets Store | 90-day | TBD |
| `CHITTY_AUTH_SERVICE_TOKEN` | Privileged supersession mint authorization | CF Secrets Store (`chitty_auth_service_token`) | centrally governed | shared store |
| `LEDGER_SIGNING_KEY` | Sign mint events for ChittyLedger | CF Secrets Store | 365-day | TBD |
| `JURISDICTION_REGISTRY_TOKEN` | Validate LLL codes against canon | CF Secrets Store | 365-day | TBD |

Rotation policy per SOP-080 (TBD).

## 5. Incident path

- **Detection**: ChittyMonitor dashboard for id.chitty.cc; CF analytics on 4xx/5xx spike
- **Triage**: ChittyOps L1
- **Escalation**:
  - L1: ChittyOps oncall
  - L2: ChittyFoundation governance council
- **Critical incident** (mint collision, signature compromise): freeze mint endpoint immediately; ledger reconciliation required

## 6. Audit logging

- **Every mint** → ChittyLedger entry `E/ChittyIDMinted` with: chitty_id minted, type, jurisdiction, requester ChittyID, timestamp, signature
- **Failed mint attempts** → `E/ChittyIDMintFailed`
- **Supersession mint/verification** → preserve predecessor, successor, audit ID, authority, and proof-verification outcome; predecessor is never rewritten in place
- **Resolve queries** (sampled 1%) → `E/ChittyIDResolved`
- Retention: forever (ledger append-only)
