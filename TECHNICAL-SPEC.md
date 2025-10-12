---
chittyid: PENDING-MINT
document_type: technical_specification
version: 2.0.0
date_created: 2025-10-06
last_updated: 2025-10-06
status: DEPLOYED
---

# ChittyID - Technical Specification

**Version**: 2.0.0
**Status**: ✅ Deployed (Worker) / ⏸️ Domain Routing Pending
**Authority**: https://id.chitty.cc (intended)
**Current Worker**: https://chittyid-production.chittycorp-llc.workers.dev

---

## Overview

ChittyID is the central identity authority for the ChittyOS ecosystem. It provides deterministic, globally unique identifiers for all entities, assets, locations, events, and data within the system.

**Core Principle**: **NO local ID generation is permitted** - all ChittyIDs MUST be minted from this service.

---

## Architecture

### Service Deployment

**Current Status** (as of 2025-10-06):

- **Worker Deployed**: ✅ YES
  - Name: `chittyid-production`
  - URL: https://chittyid-production.chittycorp-llc.workers.dev
  - Health: ✅ Operational
  - Version: 2.0.0

- **Domain Routing**: ⏸️ PENDING
  - Target: https://id.chitty.cc
  - Status: DNS/routing configuration needed
  - See: [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) for current deployment details

- **Quarantined Portal**: ⚠️ SEPARATE SYSTEM
  - Location: `.quarantine/ChittyPortal/src/services/chittyid.js`
  - Status: Alternative implementation, not in production
  - Relationship: Portal is broader system containing ChittyID service

### System Components

1. **Minting Service**: Generates new ChittyIDs with sequence management
2. **Validation Service**: Verifies ChittyID format and checksum integrity
3. **Health Monitoring**: Service status and availability checks
4. **Authentication**: Bearer token-based authorization (CHITTY_ID_TOKEN)

---

## ChittyID Format

### Standard Format

```
CHITTY-{ENTITY_TYPE}-{SEQUENCE}-{CHECKSUM}
```

**Example**:
```
CHITTY-PEO-00001-A1B2C3
```

### Components

1. **Prefix**: `CHITTY` (constant)
2. **Entity Type**: Classification of the identity (PEO, PLACE, PROP, etc.)
3. **Sequence**: 5-digit zero-padded sequential number (00001-99999)
4. **Checksum**: 6-character alphanumeric validation code

---

## Entity Types

ChittyID supports 9 entity types:

| Code | Entity Type | Description | Example Use Case |
|------|-------------|-------------|------------------|
| **PEO** | Person, Entity, Organization | Legal entities, companies, individuals | ARIBIA LLC, ChittyCorp LLC |
| **PLACE** | Physical Location | Real estate, properties, addresses | City Studio property, office buildings |
| **PROP** | Property, Asset | Digital assets, domains, intellectual property | furnished-condos.com, software licenses |
| **EVNT** | Event | Transactions, occurrences, activities | Property closings, contract signings |
| **AUTH** | Authority | Credentials, permissions, authorizations | API keys, access tokens |
| **INFO** | Information | Documents, records, data | Operating agreements, deeds |
| **FACT** | Factual Claim | Verified facts, attestations | Property ownership claims |
| **CONTEXT** | Contextual Data | Metadata, relationships | Entity relationships |
| **ACTOR** | Acting Party | Agents, representatives | Property managers, attorneys |

---

## API Endpoints

### Production Endpoints

**Current Worker URL**: `https://chittyid-production.chittycorp-llc.workers.dev`
**Intended Domain**: `https://id.chitty.cc` (pending DNS routing)

### 1. Health Check

**Endpoint**: `GET /health`
**Authentication**: None
**Response**:

```json
{
  "service": "ChittyID",
  "status": "healthy",
  "version": "2.0.0",
  "authority": "id.chitty.cc",
  "features": ["minting", "validation", "deterministic"],
  "entityTypes": ["PEO", "PLACE", "PROP", "EVNT", "AUTH", "INFO", "FACT", "CONTEXT", "ACTOR"],
  "timestamp": "2025-10-06T12:00:00.000Z"
}
```

### 2. Mint ChittyID

**Endpoint**: `POST /v1/mint`
**Authentication**: Required (Bearer token)
**Headers**:

```
Authorization: Bearer ${CHITTY_ID_TOKEN}
Content-Type: application/json
```

**Request Body**:

```json
{
  "entityType": "PEO",
  "metadata": {
    "legal_name": "ARIBIA LLC",
    "entity_type": "llc",
    "series_llc": true
  }
}
```

**Response** (201 Created):

```json
{
  "id": "CHITTY-PEO-00001-A1B2C3",
  "entityType": "PEO",
  "sequence": "00001",
  "checksum": "A1B2C3",
  "timestamp": "2025-10-06T12:00:00.000Z",
  "metadata": {
    "legal_name": "ARIBIA LLC",
    "entity_type": "llc",
    "series_llc": true
  }
}
```

**Error Response** (401 Unauthorized):

```json
{
  "error": "Unauthorized",
  "message": "CHITTY_ID_TOKEN required. Include 'Authorization: Bearer <token>' header."
}
```

### 3. Validate ChittyID

**Endpoint**: `GET /v1/validate/{chittyid}`
**Authentication**: None
**Example**: `GET /v1/validate/CHITTY-PEO-00001-A1B2C3`

**Response** (Valid):

```json
{
  "valid": true,
  "entityType": "PEO",
  "sequence": "00001",
  "checksum": "A1B2C3"
}
```

**Response** (Invalid):

```json
{
  "valid": false,
  "error": "Invalid checksum"
}
```

---

## Implementation Details

### Checksum Algorithm

The checksum is generated using a deterministic hash of the entity type and sequence:

```javascript
function generateChecksum(entityType, sequence) {
  const data = `${entityType}-${sequence}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0")
    .slice(0, 6);
}
```

**Properties**:
- Deterministic (same inputs always produce same checksum)
- Collision-resistant within entity type
- 36^6 possible values (~2.1 billion combinations)

### Sequence Management

**Current Implementation**: In-memory Map (development/testing)
**Production Requirement**: Persistent storage (KV or D1)

**KV Bindings** (Production):
- `MCP_SESSIONS`: dd1dff525a27431aa47844eb364e6606
- `OAUTH_TOKENS`: 0189885179514d639776ec3bfe8f8274
- `API_KEYS`: 41593bb3096745c0b59e0bf6d5cbae20
- `PLATFORM_CACHE`: d66c1e709c72456fa21aaa0d02f2db5e
- `PLATFORM_KV`: d52d89c1eebd402b95719161d311e7df

**Thread Safety**: KV operations are atomic, ensuring no duplicate sequences

---

## Blockchain Integration Status

**Current Status**: ⏸️ **DESIGN PHASE - NOT YET IMPLEMENTED**

ChittyIDs are designed to be immutable once minted, following blockchain permanence principles. However, blockchain anchoring is not yet implemented in production.

**Implementation Roadmap**:

1. **Phase 1** (Current): ✅ Deterministic ID generation
2. **Phase 2** (Planned): ⏸️ ChittyChain blockchain integration
3. **Phase 3** (Planned): ⏸️ Immutability enforcement
4. **Phase 4** (Planned): ⏸️ Distributed ledger validation

**Current Behavior**:
- ChittyIDs are generated deterministically
- IDs are stored in KV storage
- No blockchain anchoring yet implemented
- Correction procedures: Admin-level updates possible (not publicly documented)

**Recommendation**: Treat ChittyIDs as permanent to align with future blockchain implementation, but understand that current system allows corrections if errors occur.

---

## Authentication

### CHITTY_ID_TOKEN

**Purpose**: Authorize ChittyID minting operations
**Format**: Bearer token
**Scope**: Minting only (validation is public)

**How to Obtain**:
- Contact ChittyOS administrator
- Generate via ChittyAuth service (future)

**How to Use**:

```bash
# Set environment variable
export CHITTY_ID_TOKEN="your_token_here"

# Include in API request
curl -X POST https://id.chitty.cc/v1/mint \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entityType":"PEO","metadata":{"legal_name":"ARIBIA LLC"}}'
```

---

## Error Handling

### Common Errors

| Error Code | Message | Cause | Solution |
|------------|---------|-------|----------|
| 401 | Unauthorized | Missing/invalid CHITTY_ID_TOKEN | Set valid token |
| 400 | Invalid entity type | Entity type not in allowed list | Use PEO, PLACE, PROP, etc. |
| 400 | Invalid metadata format | Malformed JSON | Check JSON syntax |
| 503 | Service unavailable | Worker or KV outage | Retry or contact admin |

### Error Response Format

```json
{
  "error": "Error message",
  "service": "ChittyID",
  "timestamp": "2025-10-06T12:00:00.000Z"
}
```

---

## Usage Examples

### Example 1: Mint Entity ChittyID

```bash
curl -X POST https://chittyid-production.chittycorp-llc.workers.dev/v1/mint \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entityType": "PEO",
    "metadata": {
      "legal_name": "ARIBIA LLC",
      "entity_type": "llc",
      "series_llc": true
    }
  }'
```

### Example 2: Mint Domain ChittyID

```bash
curl -X POST https://chittyid-production.chittycorp-llc.workers.dev/v1/mint \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entityType": "PROP",
    "metadata": {
      "asset_type": "domain",
      "domain": "furnished-condos.com",
      "owner": "CHITTY-PEO-00001-A1B2C3"
    }
  }'
```

### Example 3: Validate ChittyID

```bash
curl https://chittyid-production.chittycorp-llc.workers.dev/v1/validate/CHITTY-PEO-00001-A1B2C3
```

---

## Security Considerations

### Token Security

- **Never commit** CHITTY_ID_TOKEN to version control
- **Never log** full token values
- **Rotate** tokens periodically
- **Use** environment variables or secrets management (1Password, etc.)

### Rate Limiting

Current implementation: None (trust-based)
Planned: Rate limiting per token

### Validation

- Checksums prevent typos and corruption
- Format validation ensures well-formed IDs
- Entity type constraints enforce taxonomy

---

## Deployment Status

For current deployment status, DNS routing, and production configuration, see:

- **[DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md)** - Current worker deployment details
- **[ROUTE_MIGRATION_GUIDE.md](ROUTE_MIGRATION_GUIDE.md)** - DNS and routing configuration

---

## Integration Guidance

### For CORPORATE_STRATEGY Project

When using ChittyID for corporate strategy entity minting:

1. **Prerequisites**:
   - CHITTY_ID_TOKEN environment variable set
   - Access to ChittyID service (worker or domain)
   - Verification checklist 100% complete

2. **Minting Order**:
   - Mint entities first (PEO)
   - Mint domains second (PROP)
   - Mint properties third (PLACE)

3. **Scripts**:
   - Use provided minting scripts in CORPORATE_STRATEGY/scripts/
   - Scripts handle token auth and error reporting
   - Output files: entity-ids.txt, domain-ids.txt, property-ids.txt

4. **Troubleshooting**:
   - Check /health endpoint first
   - Verify CHITTY_ID_TOKEN is valid
   - Review error messages for specific issues

---

## Changelog

### Version 2.0.0 (2025-10-04)
- ✅ Deployed chittyid-production worker
- ✅ Configured KV namespace bindings
- ✅ Removed outdated workers
- ✅ Established canonical naming convention

### Version 1.0.0 (2025-09-XX)
- Initial ChittyID implementation
- Basic minting and validation

---

## Support

**Documentation**:
- Technical Spec: This document
- Deployment Status: [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md)
- Security: [SECURITY_ENFORCEMENT.md](SECURITY_ENFORCEMENT.md)
- Integration: [INTEGRATION_COMPLETE.md](INTEGRATION_COMPLETE.md)

**Contact**:
- ChittyOS Team: nick@chittycorp.com
- Service Issues: Check worker status at https://chittyid-production.chittycorp-llc.workers.dev/health

---

**Last Updated**: 2025-10-06
**Version**: 2.0.0
**Status**: Deployed (Worker) / Domain Routing Pending
**Maintainer**: ChittyOS Foundation

