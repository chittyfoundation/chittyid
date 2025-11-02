# ChittyID Bootstrap Flow - How to Get Your First ChittyID

## 🔴 The Problem You Identified

**Circular Dependency:**
- ChittyAuth requires a ChittyID to provision tokens
- ChittyID requires a ChittyAuth token to generate IDs
- **How do you get started?** ❌

## ✅ The Solution: Self-Service Registration

We added a **PUBLIC registration endpoint** that provisions BOTH your ChittyID and initial API token together!

---

## 🚀 Complete Bootstrap Flow

### Option 1: Self-Service Registration (Recommended)

**PUBLIC Endpoint** - No authentication required!

```bash
curl -X POST https://auth.chitty.cc/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "entityType": "P",
    "region": "1",
    "jurisdiction": "USA"
  }'
```

**Response:**
```json
{
  "success": true,
  "registration": {
    "chittyId": "03-1-USA-1234-P-251-0-82",
    "name": "John Doe",
    "email": "john@example.com",
    "entityType": "P",
    "trustLevel": "0",
    "registeredAt": "2025-11-02T12:34:56Z"
  },
  "token": {
    "accessToken": "ca_live_dG9rX2FiYzEyM18xNzMwNTQzMjk2",
    "tokenId": "tok_abc123xyz",
    "expiresAt": "2025-12-02T12:34:56Z",
    "scope": ["chittyid:read", "chittyid:generate"]
  },
  "nextSteps": {
    "message": "Registration successful! Your ChittyID and API token are ready.",
    "upgradeVerification": "To increase trust level, verify your identity at https://connect.chitty.cc",
    "documentation": "https://docs.chitty.cc/getting-started",
    "apiUsage": "Use your token in API requests: Authorization: Bearer ca_live_..."
  }
}
```

**Now you can use your token:**

```bash
# Generate additional ChittyIDs
curl -X GET "https://id.chitty.cc/api/get-chittyid?for=thing" \
  -H "Authorization: Bearer ca_live_dG9rX2FiYzEyM18xNzMwNTQzMjk2"

# Validate ChittyIDs
curl -X POST https://id.chitty.cc/api/validate \
  -H "Authorization: Bearer ca_live_dG9rX2FiYzEyM18xNzMwNTQzMjk2" \
  -H "Content-Type: application/json" \
  -d '{"id": "03-1-USA-1234-P-251-0-82"}'
```

---

### Option 2: ChittyConnect Integration

If you already have ChittyConnect authentication:

```bash
# Step 1: Authenticate via ChittyConnect (OAuth flow)
# This returns your ChittyID

# Step 2: Request API token using your ChittyID
curl -X POST https://auth.chitty.cc/v1/tokens/provision \
  -H "Content-Type: application/json" \
  -d '{
    "chittyId": "03-1-USA-1234-P-251-3-82",
    "scope": ["chittyid:read", "chittyid:generate"],
    "service": "chittyid",
    "expiresIn": 2592000
  }'
```

---

## 🏗️ Complete Ecosystem Flow

### New User Registration Flow

```
┌──────────────────────────────────────────────────────────┐
│ 1. User Registration (No Auth Required)                  │
└──────────────────────────────────────────────────────────┘

POST https://auth.chitty.cc/v1/register
{
  "name": "John Doe",
  "email": "john@example.com"
}

↓ ChittyAuth provisions:
  ✅ ChittyID: 03-1-USA-1234-P-251-0-82
  ✅ API Token: ca_live_abc123...
  ✅ Stored in chittyos-core database

┌──────────────────────────────────────────────────────────┐
│ 2. Use Token for All Operations                          │
└──────────────────────────────────────────────────────────┘

GET https://id.chitty.cc/api/get-chittyid?for=thing
Authorization: Bearer ca_live_abc123...

↓ ChittyID validates token:
  ✅ Calls ChittyAuth to validate
  ✅ Token is valid
  ✅ Generates new ChittyID

┌──────────────────────────────────────────────────────────┐
│ 3. Upgrade Trust Level (Optional)                        │
└──────────────────────────────────────────────────────────┘

Visit https://connect.chitty.cc
- Verify identity (government ID, etc.)
- Trust level increases from 0 → 3
- More privileges unlocked
```

---

## 📊 Database Integration (chittyos-core)

### Registrations Table

```sql
-- Added to existing chittyos-core database
CREATE TABLE registrations (
  chitty_id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  token_id TEXT,
  registered_at INTEGER NOT NULL,
  verified_at INTEGER,
  verification_method TEXT
);
```

### Token Lifecycle

```sql
-- Stored in AUTH_DB (can be chittyos-core or separate)
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  chitty_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
```

---

## 🔐 Security Considerations

### Initial Registration
- **Trust Level 0** (Unverified) - Default for self-registration
- **Limited Scopes** - `chittyid:read`, `chittyid:generate` only
- **Rate Limited** - 100 requests/hour for L0 tokens
- **Email Verification** - One registration per email
- **No Duplicates** - Email uniqueness enforced

### Trust Level Progression

```
L0 (Unverified)  → Self-registration
  ↓ (email verification)
L1 (Basic)       → Email verified
  ↓ (phone verification)
L2 (Standard)    → Phone verified
  ↓ (ID verification via ChittyConnect)
L3 (Verified)    → Government ID verified
  ↓ (business verification)
L4 (Premium)     → Business entity verified
  ↓ (official status)
L5 (Official)    → Government/ChittyCorp issued
```

### Token Security
- ✅ SHA-256 hashed storage
- ✅ HMAC-SHA256 signatures
- ✅ 30-day expiration (default)
- ✅ Scope-based authorization
- ✅ Per-token rate limiting
- ✅ Revocation blacklist
- ✅ Audit logging

---

## 🎯 API Endpoints Summary

### Public (No Auth Required)
- `POST /v1/register` - Get your first ChittyID + token

### Token Operations (Requires ChittyID)
- `POST /v1/tokens/provision` - Get additional tokens
- `POST /v1/tokens/refresh` - Refresh before expiry
- `POST /v1/tokens/revoke` - Revoke token

### Validation (Used by Services)
- `POST /v1/tokens/validate` - Validate token
- `POST /v1/service/authenticate` - Service-to-service auth

### Monitoring
- `GET /health` - Service health
- `GET /v1/tokens/stats` - Usage statistics (admin)

---

## 💡 Use Cases

### Individual Developer
```bash
# 1. Register
curl -X POST https://auth.chitty.cc/v1/register \
  -d '{"name":"Dev User","email":"dev@example.com"}'

# 2. Get token from response
TOKEN="ca_live_abc123..."

# 3. Build applications
curl -X GET "https://id.chitty.cc/api/get-chittyid?for=thing" \
  -H "Authorization: Bearer $TOKEN"
```

### Organization/Service
```bash
# 1. Register organization ChittyID
curl -X POST https://auth.chitty.cc/v1/register \
  -d '{
    "name":"ACME Corp",
    "email":"api@acme.com",
    "entityType":"T"
  }'

# 2. Get service token with elevated scopes
# (after ChittyConnect verification)

# 3. Integrate with ChittyOS services
```

---

## 🔄 Token Lifecycle Example

```bash
# Day 1: Register
curl -X POST https://auth.chitty.cc/v1/register \
  -d '{"name":"Alice","email":"alice@example.com"}'

# Response includes ChittyID + Token

# Days 2-29: Use token
curl -X GET https://id.chitty.cc/api/get-chittyid \
  -H "Authorization: Bearer ca_live_abc123..."

# Day 30: Refresh token before expiry
curl -X POST https://auth.chitty.cc/v1/tokens/refresh \
  -d '{"token":"ca_live_abc123...","expiresIn":2592000}'

# Get new token, old one auto-revoked

# Or: Explicitly revoke
curl -X POST https://auth.chitty.cc/v1/tokens/revoke \
  -d '{"tokenId":"tok_abc123","reason":"Security rotation"}'
```

---

## 🚨 Error Handling

### Email Already Registered
```json
{
  "success": false,
  "error": "Email already registered",
  "message": "This email is already associated with a ChittyID. Use token refresh instead."
}
```

### Invalid Token
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Token has expired",
  "help": {
    "message": "API tokens are required for all ChittyID operations",
    "howToGetToken": "Request a token from https://auth.chitty.cc/v1/tokens/provision"
  }
}
```

### Rate Limit Exceeded
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests",
  "retryAfter": 3600
}
```

---

## ✅ Summary

### Before (Your Question)
❌ Circular dependency - couldn't get first ChittyID
❌ No bootstrap mechanism
❌ Unclear how to start

### After (Solution)
✅ Public `/v1/register` endpoint
✅ Get ChittyID + token together
✅ No auth required for registration
✅ Complete user lifecycle
✅ Integrated with chittyos-core database

---

## 📚 Documentation Links

- **Architecture**: See `ARCHITECTURE.md` in chittyauth repo
- **Deployment**: See `DEPLOYMENT.md` in chittyauth repo
- **API Reference**: See `README.md` in chittyauth repo

---

**The bootstrap problem is solved!** 🎉

New users can now self-register to get their first ChittyID and API token, then use that token for all future operations.
