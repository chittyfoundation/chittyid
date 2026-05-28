# GitHub Actions Deployment Setup Guide

**ChittyID Authority Service** - Production CI/CD Configuration

---

## Overview

This guide walks you through setting up GitHub Actions for automated deployment of the ChittyID authority service to Cloudflare Workers with proper validation, approval gates, and ChittyContext environment management.

---

## Prerequisites

- [x] GitHub repository with admin access
- [x] Cloudflare account with Workers access (ChittyCorp LLC: `0bc21e3a5a9de1a4cc843be9c3e98121`)
- [x] Cloudflare API token with Workers deployment permissions
- [x] Required secrets (CHITTY_ID_TOKEN, CHITTY_API_KEY, etc.)
- [x] ChittyContext configuration (`chittycontext.config.js`)

---

## Step 1: Create GitHub Secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### Required Secrets (All Environments)

```bash
# Cloudflare Configuration
CLOUDFLARE_API_TOKEN=<your_cloudflare_api_token>
CLOUDFLARE_ACCOUNT_ID=0bc21e3a5a9de1a4cc843be9c3e98121

# ChittyID Core
CHITTY_ID_TOKEN=<your_chitty_id_token>
CHITTY_API_KEY=<your_chitty_api_key>

# Database
NEON_DATABASE_URL=<your_neon_postgresql_url>

# ChittyOS Integration
CHITTYOS_SERVICE_TOKEN=<your_service_token>

# Notion Integration (Optional)
NOTION_TOKEN=<your_notion_token>
NOTION_DATABASE_ID_ATOMIC_FACTS=<your_notion_database_id>
```

### Staging-Specific Secrets (Optional)

If you want separate staging credentials:

```bash
CHITTY_ID_TOKEN_STAGING=<staging_token>
CHITTY_API_KEY_STAGING=<staging_api_key>
```

---

## Step 2: Configure GitHub Environments

### Create Production Environment

1. Go to **Settings** → **Environments** → **New environment**
2. Name: `production`
3. Configure protection rules:

#### Required Reviewers
- ✅ Enable "Required reviewers"
- Add yourself (or team members)
- Minimum: 1 reviewer required

#### Wait Timer (Optional but Recommended)
- ✅ Enable "Wait timer"
- Set to: **5 minutes**
- This gives time to review deployment summary before it proceeds

#### Deployment Branches
- ✅ Enable "Deployment branches"
- Select: "Selected branches"
- Add rule: `main` only

### Create Staging Environment

1. Go to **Settings** → **Environments** → **New environment**
2. Name: `staging`
3. Configure protection rules:
   - No required reviewers (auto-deploy)
   - Deployment branches: `main` and `staging`

### Production Environment Secrets

You can override secrets per environment if needed:

**Settings** → **Environments** → **production** → **Add secret**

---

## Step 3: Obtain Cloudflare API Token

### Create API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use template: **Edit Cloudflare Workers**
4. Configure permissions:
   - Account: ChittyCorp LLC
   - Zone: chitty.cc
   - Permissions:
     - `Workers Scripts:Edit`
     - `Workers KV Storage:Edit`
     - `Workers Routes:Edit`
5. Copy the token (you'll only see it once!)

---

## Step 4: Test ChittyContext Locally

Before pushing to GitHub, validate your configuration locally:

```bash
cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid/

# Validate development environment
npm run context:validate:dev

# Validate staging environment
npm run context:validate:staging

# Validate production environment
npm run context:validate:prod

# Check if secrets are set (will fail in local env, that's expected)
npm run context:check-secrets production

# Export environment variables format
npm run context:export production
```

Expected output:
```
============================================================
  ChittyContext Validation - PRODUCTION
============================================================

📁 Checking required files...
  ✅ src/services/drand-beacon.js
  ✅ src/services/vrf-generator.js
  ✅ functions/api/[[route]].js
  ✅ wrangler.toml

🔍 Scanning for blocked patterns...
  ✅ No blocked patterns found

⚙️  Environment Configuration:
  Environment: production
  Domain: id.chitty.cc
  Worker: chittyid-production

📦 KV Namespaces:
  ✅ CHITTYID_KV: ec782932b5f54c359d9aef2e28898bf9
  ✅ MCP_SESSIONS: dd1dff525a27431aa47844eb364e6606
  ...

✅ VALIDATION PASSED - No issues found
```

---

## Step 5: Verify Workflow Files

Ensure these files exist in your repository:

```
.github/
└── workflows/
    └── deploy-production.yml

scripts/
└── chittycontext.js

chittycontext.config.js
```

Check the workflow file:

```bash
cat .github/workflows/deploy-production.yml
```

---

## Step 6: Initial Deployment

### Option 1: Push to Main Branch (Auto-Deploy)

```bash
git add .
git commit -m "feat: Add ChittyContext and GitHub Actions CI/CD

- Implement ChittyContext environment management
- Add comprehensive GitHub Actions workflow
- Integrate validation gates and approval process
- Ready for production deployment
"
git push origin main
```

This will trigger:
1. ✅ Validation stage (automatic)
2. ✅ Security tests (automatic)
3. ✅ Test suite (automatic)
4. ✅ Staging deployment (automatic)
5. ⏸️ **Production deployment (requires approval)**

### Option 2: Manual Trigger

Go to **Actions** → **Deploy ChittyID Production** → **Run workflow**

---

## Step 7: Monitor Deployment

### Watch GitHub Actions

1. Go to **Actions** tab in GitHub
2. Click on the running workflow
3. Monitor each stage:
   - Validate
   - Security
   - Test
   - Deploy Staging
   - **[APPROVAL REQUIRED]** Deploy Production

### Review Deployment Summary

Before approving, review the deployment summary generated by the workflow. It will show:
- Commit SHA
- Changes included
- Validation results
- Test results
- Staging deployment status

### Approve Production Deployment

1. Click **Review deployments** button
2. Select `production` environment
3. Click **Approve and deploy**

### Monitor Deployment Progress

```bash
# Watch Cloudflare deployment
wrangler tail chittyid-production --format pretty

# Check health endpoint
curl https://id.chitty.cc/health

# Test VRF mint endpoint
curl -X POST https://id.chitty.cc/v1/mint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -d '{
    "namespace": "GEN",
    "entityType": "T",
    "region": "1",
    "jurisdiction": "USA",
    "trustLevel": 3,
    "content": {"test": "production-test"}
  }'
```

---

## Step 8: Post-Deployment Verification

The workflow automatically performs post-deployment monitoring for 5 minutes. Verify manually:

### Health Check
```bash
curl https://id.chitty.cc/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ChittyID Authority",
  "version": "2.0.0"
}
```

### VRF Mint Test
```bash
curl -X POST https://id.chitty.cc/v1/mint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -d '{
    "namespace": "GEN",
    "entityType": "P",
    "region": "1",
    "jurisdiction": "USA",
    "trustLevel": 3,
    "content": {
      "name": "Production Test",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "chittyId": "03-C-GEN-XXXX-P-XXX-3-XX",
  "metadata": {
    "contentHash": "...",
    "beacon": {
      "round": ...,
      "randomness": "..."
    }
  },
  "generation": {
    "method": "VRF with drand beacon + content binding",
    "deterministic": true,
    "verifiable": true
  }
}
```

---

## Troubleshooting

### Workflow Fails at Validation Stage

**Error**: "Math.random() found in production code"

**Solution**:
```bash
# Check for Math.random() patterns
grep -r "Math.random()" src/ functions/ worker.js

# Remove any Math.random() usage
# Commit and push changes
```

### Workflow Fails at Secrets Check

**Error**: "Required secret CHITTY_ID_TOKEN not set"

**Solution**:
1. Go to **Settings** → **Secrets** → **Actions**
2. Add the missing secret
3. Re-run the workflow

### Staging Deployment Succeeds but Production Fails

**Possible causes**:
- Different secrets between staging and production
- Missing production environment configuration
- Cloudflare account permissions

**Solution**:
```bash
# Validate production configuration locally
npm run context:validate:prod

# Check Cloudflare account ID
wrangler whoami

# Verify API token has production permissions
```

### Deployment Succeeds but Health Check Fails

**Error**: "Production health check FAILED"

**Solution**:
```bash
# Wait for propagation (up to 60 seconds)
sleep 60

# Check directly
curl -v https://id.chitty.cc/health

# Check Cloudflare Workers dashboard for errors
wrangler tail chittyid-production

# If persistent, rollback
wrangler rollback --env production
```

---

## Rollback Procedure

### Automatic Rollback (via GitHub Actions)

1. Go to **Actions** → **Deploy ChittyID Production**
2. Click **Run workflow**
3. Set `rollback` input to `true`
4. Approve production deployment

### Manual Rollback

```bash
# View deployment history
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback --env production

# Verify rollback
curl https://id.chitty.cc/health
```

---

## Maintenance

### Update Secrets

```bash
# Update via wrangler (for immediate effect)
wrangler secret put CHITTY_ID_TOKEN --env production

# Update in GitHub Secrets (for next deployment)
# Go to Settings → Secrets → Update secret
```

### Update ChittyContext Configuration

Edit `chittycontext.config.js`:
```javascript
export const chittyContext = {
  environments: {
    production: {
      // Update configuration
    }
  }
}
```

Commit and push:
```bash
git add chittycontext.config.js
git commit -m "chore: Update ChittyContext configuration"
git push origin main
```

### Add New Environment

1. Edit `chittycontext.config.js` - add new environment
2. Create GitHub environment in Settings
3. Add environment-specific secrets
4. Update workflow to include new environment

---

## Security Best Practices

1. **Never commit secrets** to the repository
2. **Rotate API tokens** every 90 days
3. **Review deployment logs** for sensitive data exposure
4. **Limit GitHub Actions permissions** to minimum required
5. **Enable branch protection** on `main` branch
6. **Require signed commits** for production deployments
7. **Monitor failed login attempts** in Cloudflare dashboard
8. **Set up alerts** for unauthorized deployment attempts

---

## Next Steps

After successful deployment:

1. **Update downstream services** to use new `/v1/mint` endpoint
2. **Monitor metrics** for 24 hours
3. **Set up Cloudflare Analytics** for usage tracking
4. **Configure alerts** in Cloudflare dashboard
5. **Document migration** for 34+ ChittyOS services
6. **Schedule Phase 2** (Merkle trees, fallback service, replay protection)

---

## References

- **GitHub Actions**: https://docs.github.com/en/actions
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **ChittyContext**: `chittycontext.config.js`
- **Deployment Readiness**: `DEPLOYMENT-READINESS.md`
- **Critical Fixes**: `CRITICAL-FIXES-APPLIED.md`

---

**Generated**: October 12, 2025
**Status**: Ready for Production Deployment
**Next Review**: After first successful deployment
