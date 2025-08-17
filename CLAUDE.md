# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Commands

### Development
```bash
npm run dev                  # Start development server (Express + Vite)
npm run build               # Build client and server for production
npm run start               # Run production server
npm run check               # TypeScript type checking
npm run db:push             # Push database schema changes using Drizzle
```

## Architecture Overview

### ChittyID Universal Identity System
A decentralized identity management platform implementing universal identity verification across people, places, things, and events. The system connects to a central "mothership" service at `id.chitty.cc` for identity generation and validation.

### Key Components

#### Server Architecture (`/server`)
- **Express Server** (`index.ts`): Main entry point with middleware for JSON, logging, and error handling
- **Routes** (`routes.ts`): API endpoints for ChittyID operations, authentication, and business verification
- **ChittyAuth** (`chittyAuth.ts`): Custom authentication middleware wrapping session management
- **ChittyID Service** (`chittyIdService.ts`): Core identity service that:
  - Connects to mothership at `id.chitty.cc` for ID generation
  - Implements structured ID format: `VV-G-LLL-SSSS-T-YM-C-X`
  - Provides fallback generation with Mod-97 checksum validation
  - Handles user synchronization with central system

#### Client Architecture (`/client`)
- **React + TypeScript** with Vite bundling
- **Routing**: Using Wouter for client-side routing
- **UI Components**: Extensive shadcn/ui component library in `/client/src/components/ui`
- **State Management**: React Query for server state
- **Authentication Hook**: Custom `useAuth` hook for auth state

#### Database (`/shared/schema.ts`)
- **PostgreSQL** with Drizzle ORM
- **Key Tables**:
  - `users`: User accounts with ChittyID associations
  - `chitty_ids`: ChittyID records with trust scores and verification status
  - `verifications`: Multi-type verification records
  - `businesses`: Business entities with API keys
  - `sessions`: Session storage for authentication

### ChittyID Format
Universal entity prefixes:
- `CP-`: ChittyPerson
- `CL-`: ChittyLocation  
- `CT-`: ChittyThing
- `CE-`: ChittyEvent

Example: `CP-2025-VER-9417-Y` (Person with L1 trust level)

### Environment Variables
Required:
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default 5000)

ChittyID Service:
- `CHITTYID_MOTHERSHIP_URL`: Central server URL (default: https://id.chitty.cc)
- `CHITTYID_API_KEY`: API key for mothership
- `CHITTYID_NODE_ID`: Node identifier for this instance

### API Endpoints
Core ChittyID operations are available at:
- `POST /api/chittyid/create` - Generate new ChittyID
- `GET /api/chittyid/:code` - Retrieve ChittyID details
- `POST /api/chittyid/validate` - Validate ChittyID format
- `POST /api/trust/calculate` - Calculate trust scores
- `POST /api/business/verify-chitty` - Business verification

### Path Aliases
- `@/`: `/client/src/`
- `@shared/`: `/shared/`
- `@assets/`: `/attached_assets/`