---
uri: chittycanon://docs/ops/architecture/chitty-id
namespace: chittycanon://docs/ops
type: summary
version: 1.0.0
status: DRAFT
registered_with: chittycanon://core/services/canon
title: "ChittyID"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# ChittyID

> `chittycanon://core/services/chitty-id` | Tier 0 (Trust Anchors) | id.chitty.cc

## What It Does

Authoritative identity management foundation for the ChittyOS ecosystem. Generates, validates, and manages ChittyIDs — the universal identity format for people, places, things, events, and authorities. All other services MUST request ChittyIDs from this service; no local generation is permitted.

## Architecture

Cloudflare Worker deployed at id.chitty.cc with AI agent routing, mandatory security pipeline, and drand beacon integration for cryptographic randomness.

### Stack
- **Runtime**: Cloudflare Workers
- **Storage**: KV (caching), D1 (auth), Vectorize (AI routing)
- **Randomness**: drand beacon (cryptographic)
- **Integrity**: Mod-97 checksum (ISO 7064)

### Key Components
- `worker.js` — Entry point, routes to Pages Functions
- `functions/api/[[route]].js` — API router with pipeline enforcement
- `src/agents/` — AI agents (routing, security, validation, performance, dedup)
- `src/middleware/` — Request interception and pipeline enforcement
- `src/services/` — Notion sync, session management, registry client

### ChittyID Format
```
VV-G-LLL-SSSS-T-YM-C-X
```
Version, Geographic region, Jurisdiction, Sequential ID, Entity Type (P/L/T/E/A), Year-Month, Trust Level (0-5), Checksum.

## ChittyOS Ecosystem

### Certification
- **Badge**: ChittyOS Compatible
- **Certifier**: ChittyCertify (`chittycanon://core/services/chittycertify`)
- **Last Certified**: —

### ChittyDNA
- **ChittyID**: —
- **DNA Hash**: —
- **Lineage**: root (foundational trust anchor)

### Dependencies
| Service | Purpose |
|---------|---------|
| drand | Cryptographic randomness beacon |
| ChittyAuth | Token validation for API access |
| ChittyTrust | Trust level policy definitions |

### Endpoints
| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/health` | GET | No | Health check |
| `/api/v2/chittyid/mint` | POST | Yes | Generate new ChittyID |
| `/api/v2/chittyid/verify` | POST | Yes | Verify ChittyID validity |
| `/api/v2/chittyid/audit` | POST | Yes | Get audit trail |
| `/api/v2/chittyid/mint/batch` | POST | Yes | Batch generation |
| `/api/v2/fallback/request` | POST | Yes | Fallback service |

## Document Triad

This badge is part of a synchronized documentation triad. Changes to shared fields must propagate.

| Field | Canonical Source | Also In |
|-------|-----------------|---------|
| Canonical URI | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Tier | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Domain | CHARTER.md (Classification) | CHITTY.md (blockquote), CLAUDE.md (header) |
| Endpoints | CHARTER.md (API Contract) | CHITTY.md (Endpoints table), CLAUDE.md (API section) |
| Dependencies | CHARTER.md (Dependencies) | CHITTY.md (Dependencies table), CLAUDE.md (Architecture) |
| Certification badge | CHITTY.md (Certification) | CHARTER.md frontmatter `status` |

**Related docs**: [CHARTER.md](CHARTER.md) (charter/policy) | [CLAUDE.md](CLAUDE.md) (developer guide)
