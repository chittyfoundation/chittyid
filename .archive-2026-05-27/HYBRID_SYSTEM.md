# Hybrid ChittyID System

## 🎯 **Complete Implementation**

The Hybrid ChittyID system is now fully implemented in the **master ChittyID repository** at `/Users/nb/Development/chittyid`.

## 📁 **Directory Structure**

```
/Users/nb/Development/chittyid/
├── src/
│   └── hybrid/                           # Hybrid ID system implementation
│       ├── master-entity-schema.js       # Master entity schema & PostgreSQL
│       ├── ontology-controller.js        # Centralized ontology controller
│       ├── id-translation-worker.js      # ID format translation service
│       ├── registry-governance.js        # Registry-based governance
│       └── ontology-client.js            # Ontology-aware client library
├── wrangler.hybrid.toml                  # Cloudflare Workers configuration
├── docs/
│   └── HYBRID_SYSTEM.md                  # This documentation
└── package.json                          # Updated with hybrid scripts
```

## 🚀 **Deployment Commands**

```bash
# Deploy all hybrid workers to production
npm run deploy:hybrid:prod

# Deploy to development environment
npm run deploy:hybrid:dev

# Local development with hot reload
npm run dev:workers

# Test hybrid system
npm run test:hybrid
```

## 🔧 **Architecture Overview**

### **Core Components**

1. **Master Entity Schema** (`master-entity-schema.js`)
   - Single source of truth for hybrid ID structure
   - PostgreSQL schema for Neon database
   - Entity factory with Cloudflare crypto.randomInt
   - VRF-based checksum calculation

2. **Ontology Controller** (`ontology-controller.js`)
   - Centralized classification using ChittyOS registry
   - Pipeline enforcement (Router→Intake→Trust→Authorization→Generation)
   - Server-only generation with strict controls
   - Drand integration for cryptographic randomness

3. **ID Translation Service** (`id-translation-worker.js`)
   - Bidirectional translation between technical/legal formats
   - Batch translation support
   - Registry-based mapping storage

4. **Registry Governance** (`registry-governance.js`)
   - Policy enforcement using SERVICE_REGISTRY as SSOT
   - Stewardship assignment and validation
   - Audit logging for compliance

5. **Ontology Client** (`ontology-client.js`)
   - Client library for applications
   - Pipeline header enforcement
   - Fallback handling

### **ID Formats**

**Technical ID**: `AA-C-TSK-1234-I-25-7-X`
- Operations and system integration
- ChittyOS technical namespace mapping

**Legal ID**: `01-N-USA-1234-P-25-3-X`
- Legal compliance and jurisdictional requirements
- Regional and trust level mapping

## ⚙️ **Configuration**

### **Environment Variables**
Set via `wrangler secret put`:

```bash
wrangler secret put CHITTY_API_KEY --env production
wrangler secret put DRAND_BEACON_URL --env production
wrangler secret put DATABASE_URL --env production
```

### **KV Namespaces**
Uses existing ChittyOS infrastructure:
- `SERVICE_REGISTRY` - Entity classifications and mappings
- `SCHEMA_KV` - Schema definitions and rules
- `PLATFORM_KV` - Translation mappings and audit logs

### **Routes**
- `id.chitty.cc/ontology/*` → Ontology Controller
- `id.chitty.cc/translate/*` → Translation Service
- `id.chitty.cc/governance/*` → Governance System

## 🔐 **Security Features**

- **Server-only generation** - NO local fallbacks allowed
- **Pipeline enforcement** - All requests must include `X-ChittyOS-Pipeline` header
- **Content binding** - SHA-256 hash included in VRF calculation
- **Drand integration** - Cryptographic randomness from Cloudflare beacon
- **Audit trails** - All operations logged for compliance

## 📊 **Usage Examples**

### **Generate Hybrid IDs**
```javascript
import { OntologyAwareClient } from './src/hybrid/ontology-client.js';

const client = new OntologyAwareClient({
  ontologyUrl: 'https://id.chitty.cc/ontology',
  serverUrl: 'https://id.chitty.cc/translate',
  pipelineRequired: true
});

const result = await client.requestHybridChittyID({
  type: 'document',
  entityPath: '/Users/nb/Development/legal-doc.pdf',
  jurisdiction: 'USA'
});

console.log(result.technical_id); // AA-C-LEG-1234-I-25-7-X
console.log(result.legal_id);     // 01-N-USA-1234-P-25-3-X
```

### **Translate Between Formats**
```javascript
const translation = await client.translateId('AA-C-LEG-1234-I-25-7-X');
console.log(translation.output_id); // 01-N-USA-1234-P-25-3-X
```

## 🎛️ **Integration with ChittyChat**

The hybrid system integrates with your unified platform at `gateway.chitty.cc`:

```javascript
// In your platform worker
import { OntologyController } from './node_modules/chittyid/src/hybrid/ontology-controller.js';

// Add to your route handler:
if (url.pathname.startsWith('/api/id/')) {
  // Proxy to ChittyID hybrid system
  return await fetch(`https://id.chitty.cc${url.pathname}`, request);
}
```

## ✅ **Deployment Checklist**

1. **Environment Setup**
   - [ ] Set Cloudflare account ID in wrangler.hybrid.toml
   - [ ] Configure KV namespace IDs
   - [ ] Set environment secrets

2. **Database Setup**
   - [ ] Run PostgreSQL schema on Neon database
   - [ ] Configure Hyperdrive connection (optional)

3. **Deploy Workers**
   - [ ] `npm run deploy:hybrid:prod`
   - [ ] Verify routes are working
   - [ ] Test health endpoints

4. **Integration Testing**
   - [ ] Test hybrid ID generation
   - [ ] Verify translation service
   - [ ] Check governance enforcement

## 🔍 **Monitoring & Health Checks**

**Health Endpoints:**
- `https://id.chitty.cc/ontology/health`
- `https://id.chitty.cc/translate/health`
- `https://id.chitty.cc/governance/health`

**Key Metrics:**
- ID generation rate
- Translation success rate
- Governance policy violations
- Registry connectivity

---

**The Hybrid ChittyID system is production-ready and follows ChittyOS architectural patterns while providing the dual ID format needed for technical operations and legal compliance.**