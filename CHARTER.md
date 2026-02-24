---
uri: chittycanon://docs/ops/policy/chitty-id-charter
namespace: chittycanon://docs/ops
type: policy
version: 1.0.0
status: DRAFT
registered_with: chittycanon://core/services/canon
title: "ChittyID Charter"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# ChittyID Charter

## Classification
- **Canonical URI**: `chittycanon://core/services/chitty-id`
- **Tier**: 0 (Trust Anchors)
- **Organization**: CHITTYFOUNDATION
- **Domain**: id.chitty.cc

## Mission

ChittyID is the **authoritative identity management foundation** for the ChittyOS ecosystem. It defines HOW identities are generated, validated, and managed. All other services MUST request ChittyIDs from this Foundation service—no local generation is permitted.

## Scope

### IS Responsible For
- Authoritative ChittyID generation and minting
- Identity format definition and standardization (`VV-G-LLL-SSSS-T-YM-C-X`)
- ChittyID validation and verification
- Audit trail generation for identity operations
- Fallback ID system with error-coded prefixes (EP/EL/ET/EE)
- Trust level assignment (0-5)
- Mod-97 checksum enforcement (ISO 7064)
- drand beacon integration for cryptographic randomness
- Batch minting operations

### IS NOT Responsible For
- Authentication tokens (ChittyAuth)
- User profile storage (ChittyConnect)
- Service registration (ChittyRegister)
- Certificate signing (ChittyCert/ChittyTrust)
- Behavioral trust scoring (ChittyScore)
- Identity verification documents (ChittyVerify)

## Dependencies

| Type | Service | Purpose |
|------|---------|---------|
| Upstream | drand | Cryptographic randomness beacon |
| Peer | ChittyAuth | Token validation for API access |
| Peer | ChittyTrust | Trust level policy definitions |
| Downstream | ChittyRegister | Consumes IDs for service registration |
| Downstream | ChittyVerify | Links verification to identities |
| Downstream | ChittyChronicle | Receives audit events |
| Downstream | ChittyLedger | Records identity transactions |

## API Contract

**Base URL**: https://id.chitty.cc

### Core Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/chittyid/mint` | POST | Generate new ChittyID |
| `/api/v2/chittyid/verify` | POST | Verify ChittyID validity |
| `/api/v2/chittyid/audit` | POST | Get audit trail |
| `/api/v2/chittyid/mint/batch` | POST | Batch generation |
| `/api/v2/fallback/request` | POST | Fallback service |
| `/health` | GET | Service health |

### ChittyID Format
```
VV-G-LLL-SSSS-T-YM-C-X
│  │ │   │    │ │  │ └─ Checksum (Mod-97)
│  │ │   │    │ │  └─── Trust Level (0-5)
│  │ │   │    │ └────── Year-Month code
│  │ │   │    └──────── Entity Type (P/L/T/E/A)
│  │ │   └───────────── Sequential ID
│  │ └────────────────── Legal Jurisdiction
│  └──────────────────── Geographic Region
└─────────────────────── Version
```

Example: `CP-A-001-1234-P-2509-I-82`

### Authentication
All endpoints require Bearer token:
```
Authorization: Bearer {CHITTY_ID_TOKEN}
```

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | ChittyFoundation |
| Technical Lead | @chittyos-infrastructure |
| Security Contact | security@chitty.foundation |

## Compliance

- [ ] Service registered in ChittyRegistry
- [ ] Health endpoint operational at /health
- [ ] OpenAPI specification published
- [ ] CLAUDE.md development guide present
- [ ] Audit logging to ChittyChronicle active
- [ ] Trust level policies from ChittyTrust applied

## Security Considerations

- **STRICT NO LOCAL GENERATION**: ChittyIDs are NEVER generated locally
- **Server-Only Architecture**: All IDs must come from central server infrastructure
- **Secure Fallback System**: Pre-authorized fallback IDs from redundant service
- **Error-Coded Fallbacks**: Domain 'E' (error) vs 'C' (standard) for traceability
- **Automatic Reconciliation**: Fallback IDs replaced with permanent IDs when main server returns

## Document Triad

This charter is part of a synchronized documentation triad. Changes to shared fields must propagate.

| Field | Canonical Source | Also In |
|-------|-----------------|---------|
| Canonical URI | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Tier | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Domain | CHARTER.md (Classification) | CHITTY.md (blockquote), CLAUDE.md (header) |
| Endpoints | CHARTER.md (API Contract) | CHITTY.md (Endpoints table), CLAUDE.md (API section) |
| Dependencies | CHARTER.md (Dependencies) | CHITTY.md (Dependencies table), CLAUDE.md (Architecture) |
| Certification badge | CHITTY.md (Certification) | CHARTER.md frontmatter `status` |

**Related docs**: [CHITTY.md](CHITTY.md) (badge/one-pager) | [CLAUDE.md](CLAUDE.md) (developer guide)

---
*Charter Version: 1.0.0 | Last Updated: 2026-02-23*
