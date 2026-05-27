![Foundation](https://img.shields.io/badge/Foundation-service-8B5CF6?style=flat-square)
![Tier](https://img.shields.io/badge/tier-0%20Trust%20Anchors-6366F1?style=flat-square)

# ChittyID Foundation Service

**Official ChittyID Foundation Implementation** - Authoritative identity management for the ChittyOS ecosystem.

[![Foundation Service](https://img.shields.io/badge/ChittyFoundation-Official-gold)](https://github.com/chittyfoundation)
[![API Version](https://img.shields.io/badge/API-v2.0-blue)](https://id.chitty.cc/api/v2)
[![Charter Compliant](https://img.shields.io/badge/Charter-Compliant-green)](https://charter.chitty.cc)

## 🏛️ Foundation Authority

This is the **authoritative ChittyID Foundation service** that defines HOW ChittyIDs are generated, validated, and managed across the entire ChittyOS ecosystem. All other services must REQUEST ChittyIDs from this Foundation service.

**Production Service**: https://id.chitty.cc

## 🎯 Architecture

### Charter Compliance
- **Foundation defines HOW** - ID format, generation, validation standards
- **Services implement WHAT** - Domain-specific workflows using ChittyIDs
- **NO LOCAL GENERATION** - All IDs must be requested from Foundation service

### Official Format
- **Official Format**: `VV-G-LLL-SSSS-T-YYMM-C-XX` (e.g., `CP-A-001-1234-P-2509-I-82`)

## 🚀 API Endpoints

### v2 API (Current)
- `POST /api/v2/chittyid/mint` - Generate new ChittyID
- `POST /api/v2/chittyid/verify` - Verify ChittyID validity
- `POST /api/v2/chittyid/audit` - Get audit trail
- `POST /api/v2/chittyid/mint/batch` - Batch generation
- `POST /api/v2/fallback/request` - Fallback service

### Authentication
All endpoints require Bearer token authentication:
```bash
Authorization: Bearer your_chitty_id_token
```

## 📋 Quick Start

### Request a ChittyID
```javascript
const response = await fetch('https://id.chitty.cc/api/v2/chittyid/mint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_chitty_id_token'
  },
  body: JSON.stringify({
    entity: 'PERSON',
    name: 'John Doe',
    format: 'official'
  })
});

const result = await response.json();
console.log(result.chitty_id); // CP-A-001-1234-P-2509-I-82
```

### Verify a ChittyID
```javascript
const response = await fetch('https://id.chitty.cc/api/v2/chittyid/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_chitty_id_token'
  },
  body: JSON.stringify({
    chittyId: 'CP-A-001-1234-P-2509-I-82'
  })
});

const result = await response.json();
console.log(result.valid); // true
```

## 🛠️ Development

### Prerequisites
- Node.js 18+
- Cloudflare account with Workers enabled
- Valid CHITTY_ID_TOKEN

### Setup
```bash
git clone https://github.com/chittyfoundation/chittyid.git
cd chittyid
npm install
cp .env.example .env
# Configure your environment variables
```

### Local Development
```bash
npm run dev
```

### Deploy to Production
```bash
npm run deploy
```

### Testing
```bash
npm test                    # All tests
npm run test:security      # Security tests
npm run test:integration   # Integration tests
```

## 🔐 Security Features

- **drand Beacon Integration** - Cryptographically secure randomness
- **Mod-97 Checksum** - ISO 7064 validation standard
- **Audit Trails** - Complete chain of custody tracking
- **Fallback System** - Error-coded IDs for service availability
- **Rate Limiting** - API protection and abuse prevention

## 📊 Monitoring

- **Health Check**: https://id.chitty.cc/health
- **Dashboard**: https://id.chitty.cc/dashboard
- **Metrics**: Prometheus compatible metrics available

## 🔄 Fallback Architecture

The service includes a comprehensive fallback system:
- Error-coded IDs with EP/EL/ET/EE prefixes for temporary states
- Automatic reconciliation when primary service returns
- Complete audit trail for all fallback operations

## 📖 Documentation

- [API Documentation](https://docs.chitty.cc/chittyid)
- [Charter Specification](https://charter.chitty.cc)
- [Integration Guide](https://docs.chitty.cc/integration)

## 🤝 Contributing

This is the official ChittyID Foundation service. All changes must:
1. Maintain Charter compliance
2. Pass security validation
3. Include comprehensive tests
4. Follow Foundation architecture principles

## 📜 License

Foundation Service - ChittyFoundation Authority

## 🔗 ChittyOS Ecosystem

Part of the broader [ChittyOS Framework](https://github.com/chittyos):
- [ChittySchema](https://github.com/chittyos/chittyschema) - Universal data framework
- [ChittyRegistry](https://github.com/chittyos/chittyregistry) - Service discovery
- [ChittyCanon](https://github.com/chittyos/chittycanon) - Authoritative resolution
- [ChittyVerify](https://github.com/chittyos/chittyverify) - Trust validation

---

**🏛️ ChittyFoundation Official Repository**
Authoritative identity management for the ChittyOS ecosystem.
