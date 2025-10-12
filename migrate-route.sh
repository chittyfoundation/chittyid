#!/bin/bash
# Migrate id.chitty.cc route from chittyos-platform-production to chittyid-production
# ChittyOS Infrastructure Management

set -e

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
OLD_WORKER="chittyos-platform-production"
NEW_WORKER="chittyid-production"
ROUTE_PATTERN="id.chitty.cc/*"

echo "🔄 Migrating route: $ROUTE_PATTERN"
echo "   From: $OLD_WORKER"
echo "   To: $NEW_WORKER"
echo ""

# Step 1: Deploy new worker to remove routes from chittyos-platform-production
echo "📋 Step 1: Remove route from $OLD_WORKER"
echo "   Manual action required:"
echo "   1. Go to: https://dash.cloudflare.com/$ACCOUNT_ID/workers/overview"
echo "   2. Find worker: $OLD_WORKER"
echo "   3. Go to Triggers tab"
echo "   4. Remove route: $ROUTE_PATTERN"
echo ""
read -p "Press Enter after removing the route from $OLD_WORKER..."

# Step 2: Deploy chittyid-production with the route
echo ""
echo "📋 Step 2: Deploy $NEW_WORKER with route"
cd /Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid
wrangler triggers deploy --env production

echo ""
echo "✅ Route migration complete!"
echo "   Verify at: https://id.chitty.cc/health"
echo "   Expected version: 2.0.0"
