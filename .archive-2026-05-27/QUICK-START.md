# ChittyID CI/CD Quick Start

**5-Minute Setup for GitHub Actions Deployment**

---

## ✅ What's Already Done

- ✅ Math.random() removed from all critical paths
- ✅ drand beacon + VRF generator implemented
- ✅ /v1/mint endpoint created
- ✅ CHITTYID_KV namespace configured
- ✅ GitHub Actions workflow created
- ✅ ChittyContext environment management built
- ✅ Validation and approval gates configured

---

## 🚀 Next Steps (Do These Now)

### 1. Set GitHub Secrets (5 minutes)

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**

Click **New repository secret** and add each of these:

```
CLOUDFLARE_API_TOKEN          = <get from Cloudflare dashboard>
CLOUDFLARE_ACCOUNT_ID         = 0bc21e3a5a9de1a4cc843be9c3e98121
CHITTY_ID_TOKEN               = <your token>
CHITTY_API_KEY                = <your key>
NEON_DATABASE_URL             = <your Neon PostgreSQL URL>
CHITTYOS_SERVICE_TOKEN        = <your service token>
NOTION_TOKEN                  = <your Notion token (optional)>
NOTION_DATABASE_ID_ATOMIC_FACTS = <your Notion DB ID (optional)>
```

**Get Cloudflare API Token:**
1. https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Use template "Edit Cloudflare Workers"
3. Copy token (you only see it once!)

### 2. Configure Production Environment (2 minutes)

Go to **Settings** → **Environments** → **New environment**

Create `production` environment:
- ✅ Required reviewers: Add yourself
- ✅ Wait timer: 5 minutes (optional)
- ✅ Deployment branches: `main` only

Create `staging` environment:
- No reviewers (auto-deploy)
- Deployment branches: `main`

### 3. Test Locally (1 minute)

```bash
cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid/

# Validate configuration
npm run context:validate:prod

# Should output: ✅ VALIDATION PASSED
```

### 4. Push to Trigger Deployment

```bash
git add .
git commit -m "feat: ChittyID v2.0 with VRF + GitHub Actions CI/CD"
git push origin main
```

### 5. Monitor & Approve

1. Go to GitHub → **Actions** tab
2. Watch the workflow run
3. When it reaches **deploy-production** stage:
   - Click **Review deployments**
   - Review the summary
   - Click **Approve and deploy**

### 6. Verify Deployment

```bash
# Health check
curl https://id.chitty.cc/health

# Test VRF mint
curl -X POST https://id.chitty.cc/v1/mint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -d '{
    "namespace": "GEN",
    "entityType": "T",
    "region": "1",
    "jurisdiction": "USA",
    "trustLevel": 3,
    "content": {"test": "production-verification"}
  }'
```

---

## 📚 Documentation

- **Full Setup Guide**: `GITHUB-ACTIONS-SETUP.md`
- **Deployment Readiness**: `DEPLOYMENT-READINESS.md`
- **Critical Fixes**: `CRITICAL-FIXES-APPLIED.md`
- **Technical Spec**: `TECHNICAL-SPEC.md`

---

## 🆘 Quick Troubleshooting

**Workflow fails at validation?**
```bash
npm run context:validate:prod
# Fix any errors shown, commit, push again
```

**Missing secrets error?**
- Go to Settings → Secrets → Add the missing secret
- Re-run workflow

**Health check fails after deployment?**
```bash
# Wait 60 seconds for propagation
sleep 60
curl https://id.chitty.cc/health

# If still failing, check logs
wrangler tail chittyid-production
```

**Need to rollback?**
```bash
wrangler rollback --env production
```

---

## ✨ Available Commands

```bash
# ChittyContext validation
npm run context:validate:dev
npm run context:validate:staging
npm run context:validate:prod

# Check secrets (local)
npm run context:check-secrets production

# Export environment variables
npm run context:export production

# Deploy manually (if needed)
npm run deploy

# Monitor production
npm run monitor

# Health check
npm run health
```

---

**You're ready to deploy!** 🚀

The authority service is now deterministic, verifiable, and ready to stabilize the entire ChittyOS ecosystem.
