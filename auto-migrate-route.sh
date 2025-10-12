#!/bin/bash
# Automated route migration using wrangler API
# Migrates id.chitty.cc/* from chittyos-platform-production to chittyid-production

set -e

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
OLD_WORKER="chittyos-platform-production"
NEW_WORKER="chittyid-production"

echo "🔄 Automated Route Migration"
echo "   Route: id.chitty.cc/*"
echo "   From: $OLD_WORKER → To: $NEW_WORKER"
echo ""

# Get wrangler auth token from config
WRANGLER_CONFIG="$HOME/.wrangler/config/default.toml"

if [ ! -f "$WRANGLER_CONFIG" ]; then
    echo "❌ Wrangler not authenticated. Run: wrangler login"
    exit 1
fi

echo "✅ Wrangler authenticated"
echo ""

# Deploy chittyid-production with route (will override)
echo "📦 Deploying $NEW_WORKER with route override..."
cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid

# Try to deploy with triggers (experimental)
echo "   Attempting automated route migration..."
wrangler triggers deploy --env production 2>&1 || {
    echo ""
    echo "⚠️  Automated migration failed (route conflict)"
    echo ""
    echo "Manual steps required:"
    echo "1. Dashboard: https://dash.cloudflare.com/$ACCOUNT_ID/workers/overview"
    echo "2. Find: $OLD_WORKER → Triggers tab → Remove: id.chitty.cc/*"
    echo "3. Then run: wrangler triggers deploy --env production"
    echo ""
    echo "Or use Cloudflare API directly (requires API token)"
    exit 1
}

echo ""
echo "✅ Route migration complete!"
echo ""
echo "🔍 Verifying..."
sleep 3
curl -s https://id.chitty.cc/health | jq .

echo ""
echo "Expected: version 2.0.0"
