#!/bin/bash

# Setup Notion Webhook Integration
# Automates webhook configuration for real-time sync

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Configuration
WEBHOOK_URL="https://id.chitty.cc/webhooks/notion"
INTEGRATION_ID="${NOTION_INTEGRATION_ID:-}"
NOTION_TOKEN="${NOTION_TOKEN:-}"
WEBHOOK_SECRET=""

# Generate webhook secret if not provided
generate_webhook_secret() {
    log "Generating webhook secret..."

    WEBHOOK_SECRET=$(openssl rand -hex 32)

    # Store in Wrangler secrets
    echo "$WEBHOOK_SECRET" | wrangler secret put NOTION_WEBHOOK_SECRET

    success "Webhook secret generated and stored"
}

# Create verification token
create_verification_token() {
    log "Creating verification token..."

    VERIFICATION_TOKEN=$(openssl rand -hex 16)

    # Store in Wrangler secrets
    echo "$VERIFICATION_TOKEN" | wrangler secret put NOTION_WEBHOOK_VERIFICATION_TOKEN

    success "Verification token created and stored"
}

# Test webhook endpoint
test_webhook_endpoint() {
    log "Testing webhook endpoint..."

    # Check if endpoint is accessible
    if curl -f -s "$WEBHOOK_URL" > /dev/null; then
        success "Webhook endpoint is accessible"
    else
        error "Webhook endpoint is not accessible at $WEBHOOK_URL"
    fi

    # Test webhook status
    local status=$(curl -s "$WEBHOOK_URL" | jq -r '.status // "unknown"')
    if [[ "$status" == "healthy" ]]; then
        success "Webhook service is healthy"
    else
        warn "Webhook service status: $status"
    fi
}

# Configure Notion integration permissions
check_integration_permissions() {
    log "Checking Notion integration permissions..."

    if [[ -z "$NOTION_TOKEN" ]]; then
        error "NOTION_TOKEN not set. Please set it in environment or .env file"
    fi

    # Test basic API access
    local response=$(curl -s -w "%{http_code}" \
        -H "Authorization: Bearer $NOTION_TOKEN" \
        -H "Notion-Version: 2022-06-28" \
        "https://api.notion.com/v1/users/me")

    local status_code="${response: -3}"

    if [[ "$status_code" == "200" ]]; then
        success "Notion API access verified"
    else
        error "Failed to verify Notion API access. Status: $status_code"
    fi
}

# Create webhook subscription (manual process)
create_webhook_subscription() {
    log "Creating webhook subscription..."

    cat << EOF

📋 Manual Webhook Setup Required:

1. Visit your Notion integration settings:
   https://www.notion.so/my-integrations

2. Select your ChittyID integration

3. Go to the "Webhooks" tab

4. Click "+ Create a subscription"

5. Configure the webhook:
   - URL: $WEBHOOK_URL
   - Events: Select the following events:
     ✓ page.content_updated
     ✓ page.created
     ✓ page.deleted
     ✓ data_source.schema_updated
     ✓ comment.created

6. Set the verification token to: $VERIFICATION_TOKEN

7. Click "Create subscription"

Press Enter when you've completed the setup...
EOF

    read -r

    success "Webhook subscription setup completed manually"
}

# Test webhook with sample payload
test_webhook_functionality() {
    log "Testing webhook functionality..."

    # Create test payload
    local test_payload=$(cat << 'EOF'
{
  "type": "page.content_updated",
  "data": {
    "page_id": "test-page-id"
  },
  "timestamp": "2023-01-01T00:00:00.000Z"
}
EOF
    )

    # Calculate signature
    local timestamp=$(date +%s)
    local message="${timestamp}.${test_payload}"
    local signature=$(echo -n "$message" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)

    # Send test webhook
    local response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Notion-Signature: $signature" \
        -H "X-Notion-Timestamp: $timestamp" \
        -d "$test_payload" \
        "$WEBHOOK_URL")

    local status_code="${response: -3}"
    local body="${response%???}"

    if [[ "$status_code" == "200" ]]; then
        success "Webhook test successful"
        echo "Response: $body"
    else
        warn "Webhook test failed with status: $status_code"
        echo "Response: $body"
    fi
}

# Setup webhook monitoring
setup_webhook_monitoring() {
    log "Setting up webhook monitoring..."

    # Create monitoring script
    cat > webhook-monitor.sh << 'SCRIPT'
#!/bin/bash

# Webhook Monitor Script
# Checks webhook health and processes DLQ

WEBHOOK_URL="https://id.chitty.cc/webhooks/notion"

check_webhook_health() {
    echo "Checking webhook health..."
    curl -s "$WEBHOOK_URL" | jq -r '.status'
}

process_dlq() {
    echo "Processing webhook DLQ..."
    curl -s -X PUT "$WEBHOOK_URL/retry" | jq -r '.processed'
}

get_metrics() {
    echo "Getting webhook metrics..."
    curl -s "$WEBHOOK_URL" | jq '.metrics'
}

case "${1:-health}" in
    health)
        check_webhook_health
        ;;
    dlq)
        process_dlq
        ;;
    metrics)
        get_metrics
        ;;
    *)
        echo "Usage: $0 {health|dlq|metrics}"
        exit 1
        ;;
esac
SCRIPT

    chmod +x webhook-monitor.sh

    success "Webhook monitoring script created"
}

# Setup automated DLQ processing
setup_dlq_processing() {
    log "Setting up automated DLQ processing..."

    # Create DLQ processing cron job
    cat > process-webhook-dlq.sh << 'SCRIPT'
#!/bin/bash

# Process webhook DLQ every 5 minutes
curl -s -X PUT "https://id.chitty.cc/webhooks/notion/retry" | jq -r '
    "Processed: \(.processed), Failed: \(.failed), Remaining: \(.remaining)"
'
SCRIPT

    chmod +x process-webhook-dlq.sh

    # Add to crontab (if running on server)
    if command -v crontab &> /dev/null; then
        (crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/process-webhook-dlq.sh") | crontab -
        success "DLQ processing cron job added"
    else
        warn "Crontab not available. Set up DLQ processing manually."
    fi
}

# Update environment documentation
update_documentation() {
    log "Updating environment documentation..."

    cat >> WEBHOOK-CONFIG.md << 'DOC'
# Notion Webhook Configuration

## Environment Variables

Add these to your Cloudflare Worker/Pages environment:

```bash
# Webhook Authentication
NOTION_WEBHOOK_SECRET=<generated-secret>
NOTION_WEBHOOK_VERIFICATION_TOKEN=<generated-token>

# Notion API
NOTION_TOKEN=<your-notion-integration-token>
NOTION_DATABASE_ID_ATOMIC_FACTS=<database-id>
```

## Webhook URL

Configure in Notion integration settings:
- URL: https://id.chitty.cc/webhooks/notion
- Events: page.content_updated, page.created, page.deleted, data_source.schema_updated, comment.created

## Monitoring

- Health: GET /webhooks/notion
- Retry DLQ: PUT /webhooks/notion/retry
- Clear DLQ: DELETE /webhooks/notion/dlq

## Testing

Test webhook functionality:
```bash
./webhook-monitor.sh health
./webhook-monitor.sh metrics
./webhook-monitor.sh dlq
```

## Troubleshooting

1. Check webhook status: `curl https://id.chitty.cc/webhooks/notion`
2. View recent logs in dashboard
3. Process failed webhooks: `curl -X PUT https://id.chitty.cc/webhooks/notion/retry`
4. Clear DLQ if needed: `curl -X DELETE https://id.chitty.cc/webhooks/notion/dlq`
DOC

    success "Documentation updated"
}

# Deploy webhook configuration
deploy_webhook_config() {
    log "Deploying webhook configuration..."

    # Deploy updated code
    npm run build
    wrangler deploy

    success "Webhook configuration deployed"
}

# Print setup summary
print_setup_summary() {
    echo
    log "🎉 Notion Webhook Setup Complete!"
    echo
    echo "📋 Configuration Summary:"
    echo "   Webhook URL: $WEBHOOK_URL"
    echo "   Verification Token: $VERIFICATION_TOKEN"
    echo "   Secret: [HIDDEN]"
    echo
    echo "🔧 Management Commands:"
    echo "   Health Check: ./webhook-monitor.sh health"
    echo "   Process DLQ: ./webhook-monitor.sh dlq"
    echo "   View Metrics: ./webhook-monitor.sh metrics"
    echo
    echo "📊 Monitoring:"
    echo "   Endpoint: $WEBHOOK_URL"
    echo "   Logs: Available in Cloudflare dashboard"
    echo "   DLQ: Automatically processed every 5 minutes"
    echo
    echo "📝 Next Steps:"
    echo "1. Complete manual webhook setup in Notion"
    echo "2. Test with sample AtomicFact updates"
    echo "3. Monitor webhook metrics"
    echo "4. Configure alerts for webhook failures"
    echo
}

# Main setup function
main() {
    log "Starting Notion webhook setup..."

    local skip_deploy=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-deploy)
                skip_deploy=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--skip-deploy]"
                echo "  --skip-deploy  Setup configuration but don't deploy"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    # Execute setup steps
    generate_webhook_secret
    create_verification_token
    check_integration_permissions

    if [[ "$skip_deploy" != true ]]; then
        deploy_webhook_config
        test_webhook_endpoint
    fi

    create_webhook_subscription

    if [[ "$skip_deploy" != true ]]; then
        test_webhook_functionality
    fi

    setup_webhook_monitoring
    setup_dlq_processing
    update_documentation
    print_setup_summary

    success "Notion webhook setup completed successfully!"
}

# Run main function with all arguments
main "$@"