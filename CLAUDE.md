# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **🎯 Project Orchestration:** This project follows [ChittyCan™ Project Standards](../CHITTYCAN_PROJECT_ORCHESTRATOR.md)

## Project Overview

This is the **ChittyID Mothership** - a Cloudflare Worker-based management system for ChittyIDs from the id.chitty.cc service. ChittyID is a universal identity system for people, places, things, and events, implemented as part of the broader ChittyOS ecosystem.

### Key Architecture Components

1. **Cloudflare Worker Entry Point**: `worker.js` - Main worker that routes to Pages Functions
2. **Pages Functions Router**: `functions/api/[[route]].js` - Handles all API routes with mandatory pipeline enforcement
3. **AI Agent System**: `src/agents/` - Contains specialized agents for routing, security, validation, performance, and deduplication
4. **Pipeline Enforcement**: `src/middleware/` - Enforces mandatory security pipeline for all ChittyID generation
5. **Service Integration**: `src/services/` - Handles Notion sync, session management, registry, and other integrations
6. **CLI Interface**: `chitty-cli.ts` - TypeScript CLI for ChittyID operations (generation must use canonical service only)

### ChittyID Format

ChittyIDs follow the structured format: `VV-G-LLL-SSSS-T-YM-C-X`
- VV: Version (2 digits)
- G: Geographic region (1-9)
- LLL: Legal jurisdiction (3 letters)
- SSSS: Sequential ID (4 digits)
- T: Entity type (P/L/T/E for Person/Location/Thing/Event)
- YM: Year-Month code
- C: Trust level (0-5)
- X: Mod-97 checksum (2 digits)

## Development Commands

### Build and Deploy
```bash
# Local development
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare
npm run deploy

# Deploy to Pages
npm run deploy:pages
```

### Testing
```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Security tests
./test-security.sh

# CLI testing
./test-cli.sh
```

### Setup Commands
```bash
# Setup vectorize index for AI routing
npm run setup:vectorize

# Complete environment setup
npm run setup

# Deploy with health checks
./scripts/deploy.sh

# Run comprehensive security tests
./scripts/run-security-tests.sh
```

### Environment Variables Required

For production deployment, these secrets must be set via `wrangler secret put`:
- `NOTION_TOKEN` - Notion API integration token
- `NOTION_DATABASE_ID_ATOMIC_FACTS` - Target Notion database ID
- `CHITTY_API_KEY` - Authentication for CLI operations
- `CHITTY_SERVER_URL` - Main ChittyID server URL (default: https://id.chitty.cc)
- `CHITTY_FALLBACK_URL` - Fallback service URL (default: https://fallback.id.chitty.cc)

## Architecture Details

### Pipeline Enforcement System
All ChittyID generation goes through a mandatory pipeline:
1. **Security Interception** (`src/middleware/request-interceptor.js`)
2. **Pipeline Enforcement** (`src/middleware/pipeline-enforcer.js`)
3. **Circuit Breaking** (`src/enforcement/circuit-breaker.js`)
4. **AI Routing** through ChittyRouter AI Gateway

### AI Agent Architecture
- `routing.js` - Determines optimal routing and load balancing
- `security.js` - Validates requests and enforces security policies
- `validator.js` - Validates ChittyID format and integrity
- `performance.js` - Monitors and optimizes system performance
- `deduplication.js` - Prevents duplicate ID generation

### Service Integration Layer
- `notion-sync.js` - Bidirectional sync with Notion databases
- `session-sync.js` - Session management across ChittyOS services
- `registry-client.js` - Service discovery and registration
- `pipeline.js` - Core pipeline orchestration

### Storage Bindings
- `AUTH_CACHE` / `CHITTYOS_CACHE` / `SESSIONS` - KV namespaces for caching
- `AUTH_DB` - D1 database for authentication
- `CHITTY_VECTORS` - Vectorize index for AI routing
- `AI` - Cloudflare AI binding for agent operations

## Testing Strategy

The test suite covers:
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- Security penetration tests in `tests/security/`
- Compliance validation in `tests/compliance/`
- Pipeline enforcement validation
- AI agent behavior validation

## CLI Usage

The TypeScript CLI (`chitty-cli.ts`) enforces canonical service usage:

```bash
# Generate ChittyID (canonical service only)
CHITTY_API_KEY=<key> npx tsx chitty-cli.ts gen person

# Validate ChittyID
CHITTY_API_KEY=<key> npx tsx chitty-cli.ts validate "01-1-USA-0001-P-2509-0-82"

# Register evidence
CHITTY_API_KEY=<key> npx tsx chitty-cli.ts register person '{"name":"Kimber"}'
```

## Security Considerations

- **STRICT NO LOCAL GENERATION**: ChittyIDs are NEVER generated locally under ANY circumstances
- **Server-Only Architecture**: All IDs must come from central server infrastructure
- **Secure Fallback System**: Pre-authorized fallback IDs from redundant service (fallback.id.chitty.cc)
- **Error-Coded Fallbacks**: Fallback IDs use domain 'E' (error) vs 'C' (standard) for traceability
- **Automatic Reconciliation**: Fallback IDs are automatically replaced with permanent IDs when main server returns
- **Mandatory Pipeline**: All generation requests go through security pipeline
- **Circuit Breaking**: Automatic protection against high failure rates
- **Trust Levels**: 0 (Unverified) to 5 (Official) with proper validation
- **Checksum Validation**: Mod-97 checksum prevents tampering
- **AI Model Protection**: Prevents AI models from generating invalid ChittyIDs during network failures

## Fallback Architecture

This system implements a secure fallback architecture to maintain availability while preventing invalid ID generation:

### Server Infrastructure
- **Main Server**: `id.chitty.cc` - Primary ChittyID generation service
- **Fallback Service**: `fallback.id.chitty.cc` - Redundant, highly available fallback infrastructure
- **Client Libraries**: Located in `nb/tools/chittyid/` directory with strict server-only implementations

### Fallback ID Lifecycle
1. **Primary Request**: Client attempts to request from main server (id.chitty.cc)
2. **Fallback Request**: If main server unavailable, request pre-authorized ID from fallback service
3. **Error-Coded IDs**: Fallback IDs use domain 'E' to indicate temporary/error state
4. **Reconciliation**: When main server returns, fallback IDs are automatically replaced with permanent IDs
5. **Audit Trail**: Complete lifecycle tracking for all ID generation and reconciliation

### Client Implementation
```javascript
// Strict server-only client (no local generation)
import { ChittyIDClient } from './client.js';
const client = new ChittyIDClient({ serverUrl: 'https://id.chitty.cc' });
const chittyId = await client.requestChittyID({ type: 'I', namespace: 'GEN' });

// Client with secure fallback capability
import { ChittyIDFallbackClient } from './fallback-client.js';
const fallbackClient = new ChittyIDFallbackClient();
const chittyId = await fallbackClient.requestChittyID({ type: 'I' });
```

## Service Dependencies

This service integrates with the broader ChittyOS ecosystem:
- ChittyRouter (router.chitty.cc) - AI gateway and request routing
- ChittyCore (core.chitty.cc) - Core identity infrastructure
- ChittyTrust - Trust level determination
- ChittyLedger - Immutable transaction logging
- ChittyTrace - Forensics and audit trails

The research/ directory contains related projects (chittyentry, chittyledger) that are part of the broader ecosystem.