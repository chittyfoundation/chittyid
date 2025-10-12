# ChittyID Route Migration Guide

## Current Status

✅ **Worker Deployed**: chittyid-production (v2.0.0) - Healthy
⚠️ **Route Status**: id.chitty.cc/* currently assigned to `chittyos-platform-production`
🎯 **Goal**: Migrate route to `chittyid-production`

## Quick Migration Steps

### Option 1: Cloudflare Dashboard (Recommended - 2 minutes)

1. **Open Dashboard**:
   ```
   https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/workers/overview
   ```

2. **Remove Old Route**:
   - Find worker: `chittyos-platform-production`
   - Click on the worker name
   - Go to **Triggers** tab
   - Find route: `id.chitty.cc/*`
   - Click **Delete** or **Remove**

3. **Add New Route**:
   ```bash
   cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid
   wrangler triggers deploy --env production
   ```

4. **Verify**:
   ```bash
   curl https://id.chitty.cc/health | jq .
   # Should show: "version": "2.0.0"
   ```

### Option 2: Wrangler Commands (Advanced)

If you need to manage routes programmatically:

```bash
# 1. List current routes for chittyos-platform-production
wrangler deployments list --name chittyos-platform-production

# 2. Remove the route (manual in dashboard or via API)

# 3. Deploy chittyid-production routes
cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid
wrangler triggers deploy --env production

# 4. Verify deployment
wrangler deployments list --name chittyid-production
```

### Option 3: Cloudflare API (Expert)

Using Cloudflare API directly requires an API token:

```bash
# Set your API token
export CLOUDFLARE_API_TOKEN="your-api-token"

# Get zone ID for chitty.cc
ZONE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=chitty.cc" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[0].id')

# List routes for chittyos-platform-production
curl -s "https://api.cloudflare.com/client/v4/accounts/0bc21e3a5a9de1a4cc843be9c3e98121/workers/scripts/chittyos-platform-production/routes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq .

# Get route ID for id.chitty.cc/*
ROUTE_ID=$(curl -s "https://api.cloudflare.com/client/v4/accounts/0bc21e3a5a9de1a4cc843be9c3e98121/workers/scripts/chittyos-platform-production/routes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[] | select(.pattern == "id.chitty.cc/*") | .id')

# Delete the route
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes/$ROUTE_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Deploy new route to chittyid-production
wrangler triggers deploy --env production
```

## Verification Checklist

After migration, verify all endpoints:

### 1. Health Endpoint
```bash
curl https://id.chitty.cc/health | jq .
```
**Expected**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-04T...",
  "version": "2.0.0"
}
```

### 2. API Endpoint (Pipeline Enforcement)
```bash
curl https://id.chitty.cc/api/get-chittyid | jq .
```
**Expected**:
```json
{
  "success": false,
  "error": "PIPELINE_REQUIRED",
  "status": 401,
  "pipeline": {
    "required": true,
    "stages": ["router", "intake", "trust", "authorization", "generation"]
  }
}
```

### 3. Worker Bindings
```bash
wrangler deployments list --name chittyid-production | head -20
```
**Should show**:
- KV Namespaces: MCP_SESSIONS, OAUTH_TOKENS, API_KEYS, PLATFORM_CACHE, PLATFORM_KV
- AI binding active
- Environment variables configured

### 4. Route Assignment
```bash
wrangler triggers deploy --env production --dry-run
```
**Should show**: No conflicts, route assigned to chittyid-production

## Troubleshooting

### Issue: Route still shows old version (2.1.0)

**Solution**: Clear DNS cache and wait for propagation
```bash
# Flush DNS cache (macOS)
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Test with fresh DNS
curl -H "Cache-Control: no-cache" https://id.chitty.cc/health
```

### Issue: 502 Bad Gateway

**Cause**: Worker not healthy or KV bindings missing

**Solution**:
```bash
# Check worker health directly
curl https://chittyid-production.chittycorp-llc.workers.dev/health

# Redeploy with all bindings
wrangler deploy --env production

# Check bindings
wrangler deployments list --name chittyid-production
```

### Issue: Pipeline errors

**Cause**: Missing environment variables or KV data

**Solution**:
```bash
# Verify environment variables
wrangler deployments list --name chittyid-production | grep "env\."

# Should include:
# - CHITTYID_FOUNDATION_URL
# - CHITTYID_SERVICE_VERSION
# - All ChittyOS URLs
```

## Rollback Plan

If migration causes issues, rollback to chittyos-platform-production:

1. **Remove Route from chittyid-production**:
   ```bash
   cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid
   # Edit wrangler.toml - comment out routes section
   # Then redeploy
   wrangler deploy --env production
   ```

2. **Restore Route to chittyos-platform-production**:
   - Go to Cloudflare Dashboard
   - Find chittyos-platform-production worker
   - Triggers tab → Add Route: `id.chitty.cc/*`

3. **Verify Rollback**:
   ```bash
   curl https://id.chitty.cc/health
   # Should show version 2.1.0 (old worker)
   ```

## Migration Timeline

Estimated time: **2-5 minutes**

1. Dashboard route removal: 30 seconds
2. Wrangler triggers deploy: 30-60 seconds
3. DNS propagation: 1-3 minutes
4. Verification: 30 seconds

**Total**: ~2-5 minutes for full migration

## Post-Migration Tasks

After successful migration:

1. **Update Documentation**:
   - Mark route migration as complete in DEPLOYMENT_STATUS.md
   - Update any internal docs referencing old worker

2. **Monitor Performance**:
   ```bash
   # Watch logs for first 5 minutes
   wrangler tail chittyid-production --env production
   ```

3. **Test Client Integration**:
   ```bash
   # Test with @chittyos/chittyid-client
   cd /Users/nb/.claude/tools/chittyid
   node client.js
   ```

4. **Notify Team**:
   - ChittyID service migrated to canonical worker
   - New version: 2.0.0
   - Pipeline enforcement: Active
   - Performance: Monitor for 24 hours

## Support

- **Dashboard**: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/workers/overview
- **Worker URL**: https://chittyid-production.chittycorp-llc.workers.dev
- **Documentation**: /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid/DEPLOYMENT_STATUS.md
- **Migration Scripts**:
  - `./migrate-route.sh` (interactive)
  - `./auto-migrate-route.sh` (automated)

---

**Last Updated**: 2025-10-04
**Migration Status**: ⚠️ Pending (route conflict with chittyos-platform-production)
**Next Action**: Remove route from chittyos-platform-production via dashboard
