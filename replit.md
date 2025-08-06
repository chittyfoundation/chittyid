# ChittyID Platform

## Overview

ChittyID is a comprehensive identity verification and trust scoring platform built on a modern full-stack architecture. The system provides a universal identity backbone that issues deterministic, privacy-preserving IDs while tracking behavioral patterns across time-scales. It serves as the foundation for a larger ChittyOS ecosystem, enabling users to build trust through progressive verification steps and allowing businesses to integrate identity verification services.

The platform implements a sophisticated trust level system (L0-L5) with progressive verification requirements, dual immutability architecture for data integrity, and comprehensive audit trails. Users can verify various identity factors (email, phone, ID cards, addresses) to increase their trust scores, while businesses can integrate the platform's verification APIs to streamline their identity verification processes.

## User Preferences

Preferred communication style: Simple, everyday language.
Psychology-based color system: Each ChittyID component uses colors that psychologically represent their function (blue for trust/stability, green for growth/verification, purple for wealth/assets, gold for achievement/scores, etc.)

## System Architecture

### Frontend Architecture
The client application is built with React 18 using Vite as the build tool. It implements a component-based architecture with shadcn/ui for consistent design components and Tailwind CSS for styling. The application uses wouter for lightweight routing and TanStack Query for state management and API communication. The frontend follows a modular structure with separate pages for landing, home dashboard, verification flows, and business management.

### Backend Architecture
The server is built with Express.js and TypeScript, following a RESTful API design. It implements Replit's OpenID Connect authentication system with session-based authentication using PostgreSQL session storage. The backend uses a layered architecture with separate modules for routes, storage, and authentication. The storage layer implements a comprehensive interface pattern for database operations, ensuring consistent data access patterns across the application.

### Database Design
The system uses PostgreSQL with Drizzle ORM for type-safe database operations. The schema implements a comprehensive identity verification system with tables for users, ChittyIDs, verifications, businesses, and verification requests. It includes proper foreign key relationships, enumerated types for status tracking, and indexing for performance. The database supports session storage for authentication and includes audit trail capabilities.

### Identity Management System
ChittyID implements a structured ID format with built-in checksums and human-readable components. The system uses UUIDv7 for immediate deployment with plans for future Time-First Mod-97 Base32 implementation. The platform features a progressive verification system where users advance through trust levels (L0-L5) by completing various verification steps, each contributing to their overall trust score.

### Verification and Trust Scoring
The platform implements a multi-factor verification system supporting email, phone, ID cards, and address verification. Each verification type contributes specific trust points, and the system tracks verification status through enumerated states. The trust scoring algorithm considers multiple factors and maintains historical verification data for audit purposes.

### Business Integration Layer
The system provides APIs for businesses to integrate identity verification into their applications. Businesses can register, receive API keys, set trust thresholds, and submit verification requests. The platform tracks all verification requests and provides detailed response data for business analytics and compliance.

## External Dependencies

### Database Infrastructure
- **Neon Database**: PostgreSQL-compatible serverless database for data persistence
- **Drizzle ORM**: Type-safe database operations and schema management
- **connect-pg-simple**: PostgreSQL session store for authentication

### Authentication Services
- **Replit OpenID Connect**: Primary authentication provider
- **Passport.js**: Authentication middleware with OpenID Connect strategy
- **Express Session**: Session management with PostgreSQL backing

### Frontend Libraries
- **React 18**: Core frontend framework with modern hooks and concurrent features
- **Vite**: Build tool and development server with hot module replacement
- **TanStack Query**: Data fetching, caching, and synchronization
- **wouter**: Lightweight client-side routing
- **Tailwind CSS**: Utility-first CSS framework for styling

### UI Component System
- **shadcn/ui**: Comprehensive component library built on Radix UI primitives
- **Radix UI**: Unstyled, accessible UI primitives for complex components
- **Lucide React**: Icon library with consistent design language
- **class-variance-authority**: Type-safe component variant management

### Development and Build Tools
- **TypeScript**: Type safety across frontend and backend
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Tailwind CSS integration
- **date-fns**: Date manipulation and formatting utilities

### Validation and Schema Management
- **Zod**: Runtime type validation and schema definition
- **drizzle-zod**: Integration between Drizzle ORM and Zod schemas
- **React Hook Form**: Form state management with validation integration