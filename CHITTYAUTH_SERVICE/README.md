# ChittyAuth - Authentication & Token Provisioning Service

**Production Endpoint**: `https://auth.chitty.cc`

ChittyAuth is the centralized authentication and API token provisioning service for the entire ChittyOS ecosystem. It manages token lifecycle, validates requests, and integrates with ChittyConnect for user identity.

---

## 🚀 Quick Start

### Provision an API Token

```bash
curl -X POST https://auth.chitty.cc/v1/tokens/provision \
  -H "Content-Type: application/json" \
  -d '{
    "chittyId": "03-1-USA-0001-P-251-3-82",
    "scope": ["chittyid:read", "chittyid:generate"],
    "service": "chittyid",
    "expiresIn": 2592000
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "ca_live_dG9rX2FiYzEyM18xNzMwNTQzMjk2X3NpZ25hdHVyZQ",
  "tokenId": "tok_abc123xyz",
  "scope": ["chittyid:read", "chittyid:generate"],
  "expiresAt": "2025-12-02T00:00:00Z",
  "rateLimit": {
    "requests": 1000,
    "window": "1h"
  }
}
```

### Use Token to Call ChittyID

```bash
curl -X GET "https://id.chitty.cc/api/get-chittyid?for=person" \
  -H "Authorization: Bearer ca_live_dG9rX2FiYzEyM18xNzMwNTQzMjk2X3NpZ25hdHVyZQ"
```

---

## 📋 API Endpoints

### Token Operations

- `POST /v1/tokens/provision` - Provision new API token
- `POST /v1/tokens/validate` - Validate existing token
- `POST /v1/tokens/refresh` - Refresh token before expiration
- `POST /v1/tokens/revoke` - Revoke token immediately

### Service Authentication

- `POST /v1/service/authenticate` - Authenticate service-to-service requests

### Integration

- `POST /v1/connect/verify` - Verify ChittyID with ChittyConnect

### Monitoring

- `GET /health` - Health check
- `GET /v1/tokens/stats` - Token usage statistics (admin only)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete API documentation.

---

## 🛠️ Installation & Deployment

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Wrangler CLI installed globally

### Setup

```bash
cd chittyauth
npm install
```

### Create Required Resources

#### 1. Create KV Namespaces

```bash
# Production
wrangler kv:namespace create AUTH_TOKENS --env production
wrangler kv:namespace create AUTH_REVOCATIONS --env production
wrangler kv:namespace create AUTH_RATE_LIMITS --env production
wrangler kv:namespace create AUTH_AUDIT --env production

# Development
wrangler kv:namespace create AUTH_TOKENS --env development
wrangler kv:namespace create AUTH_REVOCATIONS --env development
wrangler kv:namespace create AUTH_RATE_LIMITS --env development
wrangler kv:namespace create AUTH_AUDIT --env development
```

Update the IDs in `wrangler.toml` with the created namespace IDs.

#### 2. Create D1 Database

```bash
# Production
wrangler d1 create chittyauth-db

# Development
wrangler d1 create chittyauth-dev-db
```

Update the database IDs in `wrangler.toml`.

#### 3. Initialize Database Schema

```bash
wrangler d1 execute chittyauth-db --env production --file=./schema.sql
wrangler d1 execute chittyauth-dev-db --env development --file=./schema.sql
```

#### 4. Set Secrets

```bash
# Generate a secure signing key (256-bit)
openssl rand -base64 32

# Set the signing key
wrangler secret put TOKEN_SIGNING_KEY --env production

# Set ChittyConnect API key (if available)
wrangler secret put CHITTYCONNECT_API_KEY --env production
```

### Deploy

```bash
# Deploy to production
npm run deploy

# Deploy to development
npm run deploy:dev
```

---

## 🔧 Local Development

```bash
npm run dev
```

The service will be available at `http://localhost:8787`

### Test Endpoints Locally

```bash
# Provision token
curl -X POST http://localhost:8787/v1/tokens/provision \
  -H "Content-Type: application/json" \
  -d '{
    "chittyId": "03-1-USA-0001-P-251-3-82",
    "scope": ["chittyid:read"],
    "service": "chittyid",
    "expiresIn": 3600
  }'

# Validate token
curl -X POST http://localhost:8787/v1/tokens/validate \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN_HERE"}'
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

---

## 🔐 Security Features

- **SHA-256 Token Hashing** - Tokens are never stored in plain text
- **HMAC-SHA256 Signatures** - Cryptographic token signatures
- **Time-based Expiration** - Configurable token TTL
- **Automatic Revocation** - Suspicious activity detection
- **Rate Limiting** - Per-token request limits
- **Audit Logging** - Complete event trail

---

## 📊 Token Scopes

### ChittyID Scopes
- `chittyid:read` - Read ChittyID information
- `chittyid:generate` - Generate new ChittyIDs
- `chittyid:validate` - Validate ChittyIDs
- `chittyid:audit` - Access audit trails

### Administrative Scopes
- `admin:*` - Full administrative access

### Service Scopes
- `service:*` - Service-to-service operations

---

## 🏗️ Architecture

ChittyAuth integrates with the ChittyOS ecosystem:

```
┌──────────────────┐
│  ChittyConnect   │ ← User authentication & identity
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   ChittyAuth     │ ← API token provisioning
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│    ChittyID      │ ← Validates tokens via ChittyAuth
│  ChittyRouter    │
│  ChittyCore      │
│  ... 51+ services│
└──────────────────┘
```

---

## 📈 Monitoring

### Health Check

```bash
curl https://auth.chitty.cc/health
```

### Token Statistics (Admin)

```bash
curl https://auth.chitty.cc/v1/tokens/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🔄 Token Lifecycle

1. **Provision** - User requests token from ChittyAuth
2. **Validate** - Service validates token on each request
3. **Use** - Token used to access protected resources
4. **Refresh** - Token refreshed before expiration (optional)
5. **Revoke** - Token revoked when no longer needed

---

## 🤝 Integration with ChittyID

ChittyID uses ChittyAuth for all token validation:

```javascript
import { ChittyAuthClient } from './src/services/chittyauth-client.js';

const auth = new ChittyAuthClient(env);
const validation = await auth.validateToken(bearerToken);

if (validation.valid) {
  // Process request
}
```

---

## 📝 Environment Variables

### Required Secrets
- `TOKEN_SIGNING_KEY` - 256-bit key for token signatures
- `CHITTYCONNECT_API_KEY` - Service token for ChittyConnect

### Optional Configuration
- `CHITTYCONNECT_URL` - ChittyConnect endpoint (default: https://connect.chitty.cc)
- `DEFAULT_TOKEN_EXPIRY` - Default token lifetime in seconds (default: 2592000 = 30 days)
- `MAX_TOKENS_PER_USER` - Maximum tokens per user (default: 10)

---

## 📚 Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [API Reference](./ARCHITECTURE.md#-api-endpoints)
- [Security Model](./ARCHITECTURE.md#-security-features)
- [Integration Guide](./ARCHITECTURE.md#-chittyconnect-integration)

---

## 🐛 Troubleshooting

### Token Validation Fails

1. Check token format (must start with `ca_live_`, `ca_test_`, etc.)
2. Verify token hasn't expired
3. Ensure token hasn't been revoked
4. Check rate limits

### Database Errors

1. Verify D1 database is created and schema initialized
2. Check database binding in wrangler.toml
3. Ensure proper permissions

### ChittyConnect Integration Issues

1. Verify `CHITTYCONNECT_API_KEY` secret is set
2. Check ChittyConnect service is running
3. Validate ChittyID format

---

## 📄 License

ChittyFoundation Official Service
© 2025 ChittyCorp LLC

---

## 🆘 Support

For issues and questions:
- Create an issue in the repository
- Contact ChittyCorp support
- Consult the architecture documentation
