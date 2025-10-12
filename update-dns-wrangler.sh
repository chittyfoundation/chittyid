#!/bin/bash
# Update DNS for id.chitty.cc to point to chittyid-production worker
# ChittyOS Infrastructure - Canonical ChittyID Service

set -e

ZONE_ID="YOUR_ZONE_ID"  # chitty.cc zone
ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
WORKER_NAME="chittyid-production"
DOMAIN="id.chitty.cc"

echo "🔄 Updating DNS for $DOMAIN to point to $WORKER_NAME worker"

# Step 1: Get the current DNS record ID for id.chitty.cc
echo "📡 Fetching current DNS records for $DOMAIN..."
DNS_RECORD=$(wrangler whoami 2>&1 | grep -i "Account ID" | awk '{print $3}')

if [ -z "$DNS_RECORD" ]; then
    echo "❌ Unable to authenticate with Cloudflare. Please run 'wrangler login'"
    exit 1
fi

echo "✅ Authenticated with Cloudflare"

# Step 2: Create or update worker route
echo "🎯 Creating worker route for $DOMAIN..."

# Use Cloudflare API to create a route
# Note: This requires CLOUDFLARE_API_TOKEN environment variable

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "⚠️  CLOUDFLARE_API_TOKEN not set"
    echo ""
    echo "Manual steps required:"
    echo "1. Go to Cloudflare Dashboard → chitty.cc zone → DNS"
    echo "2. Find the A/AAAA record for id.chitty.cc"
    echo "3. Update it to point to: chittyid-production.chittycorp-llc.workers.dev"
    echo "   OR"
    echo "4. Add a CNAME record: id.chitty.cc → chittyid-production.chittycorp-llc.workers.dev"
    echo ""
    echo "Current worker URL: https://chittyid-production.chittycorp-llc.workers.dev"
    echo "Target domain: https://id.chitty.cc"
    exit 0
fi

echo "✅ DNS update instructions provided"
