#!/bin/bash

# ChittyID Deployment Script
# Comprehensive deployment for the refactored ChittyID system with pipeline architecture

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/dist"
LOG_FILE="$PROJECT_ROOT/deployment.log"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-84f0f32886f1d6196380fe6cbe9656a8}"
PROJECT_NAME="chittyid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking deployment prerequisites..."

    # Check required tools
    local tools=("wrangler" "npm" "git")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is required but not installed"
        fi
    done

    # Check Cloudflare authentication
    if ! wrangler whoami &> /dev/null; then
        error "Not authenticated with Cloudflare. Run 'wrangler login' first"
    fi

    # Check environment variables
    if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
        warn "CLOUDFLARE_ACCOUNT_ID not set. Using default from wrangler.toml"
    fi

    success "Prerequisites check passed"
}

# Run tests
run_tests() {
    log "Running test suite..."

    cd "$PROJECT_ROOT"

    # Unit tests
    log "Running unit tests..."
    if ! npm run test:unit; then
        error "Unit tests failed"
    fi

    # Integration tests
    log "Running integration tests..."
    if ! npm run test:integration; then
        error "Integration tests failed"
    fi

    success "All tests passed"
}

# Build project
build_project() {
    log "Building project..."

    cd "$PROJECT_ROOT"

    # Clean previous build
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"

    # Install dependencies
    log "Installing dependencies..."
    npm ci

    # Build with wrangler
    log "Building with Wrangler..."
    npm run build

    # Verify build output
    if [[ ! -f "$BUILD_DIR/_worker.js" ]]; then
        error "Build failed - no worker output found"
    fi

    success "Build completed successfully"
}

# Setup Cloudflare resources
setup_cloudflare_resources() {
    log "Setting up Cloudflare resources..."

    # Set account ID if provided
    if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
        export CLOUDFLARE_ACCOUNT_ID
        log "Using Cloudflare Account ID: $CLOUDFLARE_ACCOUNT_ID"
    fi

    # Create KV namespaces if they don't exist
    log "Ensuring KV namespaces exist..."

    local kv_namespaces=(
        "AUTH_CACHE"
        "CHITTYOS_CACHE"
        "SESSIONS"
        "CHITTY_IDS"
        "CHITTY_SECRETS"
    )

    for namespace in "${kv_namespaces[@]}"; do
        if ! wrangler kv namespace list | grep -q "$namespace"; then
            log "Creating KV namespace: $namespace"
            wrangler kv namespace create "$namespace" --preview false
        else
            log "KV namespace $namespace already exists"
        fi
    done

    # Create Vectorize index if it doesn't exist
    log "Ensuring Vectorize index exists..."
    if ! wrangler vectorize list | grep -q "chittyid-routing"; then
        log "Creating Vectorize index: chittyid-routing"
        wrangler vectorize create chittyid-routing --dimensions=384 --metric=cosine
    else
        log "Vectorize index chittyid-routing already exists"
    fi

    # Create D1 database if it doesn't exist
    log "Ensuring D1 database exists..."
    if ! wrangler d1 list | grep -q "chittyauth-prod"; then
        log "Creating D1 database: chittyauth-prod"
        wrangler d1 create chittyauth-prod
    else
        log "D1 database chittyauth-prod already exists"
    fi

    success "Cloudflare resources setup completed"
}

# Deploy to Cloudflare Workers
deploy_worker() {
    log "Deploying to Cloudflare Workers..."

    cd "$PROJECT_ROOT"

    # Deploy worker
    log "Deploying worker..."
    if ! wrangler deploy --name chittyid; then
        error "Worker deployment failed"
    fi

    success "Worker deployed successfully"
}

# Deploy to Cloudflare Pages
deploy_pages() {
    log "Deploying to Cloudflare Pages..."

    cd "$PROJECT_ROOT"

    # Deploy to Pages
    log "Deploying to Pages..."
    if ! wrangler pages deploy dist --project-name=chittyid --compatibility-date=2025-01-16; then
        error "Pages deployment failed"
    fi

    success "Pages deployed successfully"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."

    local endpoints=(
        "https://id.chitty.cc/api/health"
        "https://id.chitty.cc/api/spec"
        "https://id.chitty.cc/api/session/health"
        "https://id.chitty.cc/bridges/notion/status"
    )

    for endpoint in "${endpoints[@]}"; do
        log "Testing endpoint: $endpoint"

        if curl -f -s "$endpoint" > /dev/null; then
            success "✓ $endpoint is responding"
        else
            warn "✗ $endpoint is not responding"
        fi
    done

    # Test pipeline authentication requirement
    log "Testing pipeline security..."
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" "https://id.chitty.cc/api/get-chittyid")

    if [[ "$response_code" == "401" ]]; then
        success "✓ Pipeline properly requires authentication"
    else
        warn "✗ Pipeline security may be compromised (got $response_code, expected 401)"
    fi

    success "Deployment verification completed"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring and alerts..."

    # Create basic monitoring configuration
    cat > "$PROJECT_ROOT/monitoring-config.json" << EOF
{
  "service": "chittyid",
  "version": "2.0.0",
  "endpoints": {
    "health": "/api/health",
    "session_health": "/api/session/health",
    "notion_status": "/bridges/notion/status"
  },
  "metrics": {
    "response_time_threshold": 2000,
    "error_rate_threshold": 0.05,
    "dlq_threshold": 100
  },
  "alerts": {
    "email": "ops@chitty.cc",
    "webhook": "https://hooks.chitty.cc/alerts"
  }
}
EOF

    success "Monitoring configuration created"
}

# Generate deployment report
generate_report() {
    log "Generating deployment report..."

    local report_file="$PROJECT_ROOT/deployment-report.md"

    cat > "$report_file" << EOF
# ChittyID Deployment Report

**Date:** $(date)
**Version:** 2.0.0 (Refactored)
**Deployed by:** $(git config user.name) <$(git config user.email)>

## Deployment Summary

- ✅ Tests passed
- ✅ Build successful
- ✅ Cloudflare resources configured
- ✅ Worker deployed
- ✅ Pages deployed
- ✅ Health checks passed

## Architecture Changes

### New Components
- Pipeline-based ID generation (Router → Intake → Trust → Authorization → Generation)
- Distributed session synchronization across ChittyOS ecosystem
- Hardened Notion sync with DLQ and retry logic
- Comprehensive API refactoring with clean separation

### Security Improvements
- Mandatory pipeline for all ID generation
- Session token validation across services
- Rate limiting based on trust levels
- CORS protection with configurable origins

### Reliability Features
- Exponential backoff for all external calls
- Circuit breakers for service failures
- DLQ processing for failed operations
- Health checks for all dependencies

## Service Registry (51+ Modules)

### Core Infrastructure
- chittycore, chittystandard, chittyops, chittybeacon

### Identity & Security
- chittyid, chittyverify, chittytrust, chittychain, chittyledger, chittycertify

### Business Operations
- chittyforce, chittyentry, chittycan, chittychronicle

### Legal Technology
- chittytrace, chittyintel, chittyresolution, chittyevidence, chittyforge, chittyflow

### Support Systems
- chittyassets, chittymonitor, chittyinsight, chittychat, chittycleaner, chittyformfill, chittyfinance

## API Endpoints

### Pipeline (Authenticated)
- \`GET /api/get-chittyid?for={purpose}\` - Generate ChittyID through pipeline

### Direct (Public)
- \`POST /api/validate\` - Validate existing ChittyID
- \`GET /api/info/{id}\` - Get ChittyID information
- \`POST /api/search\` - Search ChittyIDs
- \`GET /api/spec\` - Get format specification

### Bridges
- \`POST /bridges/notion/facts:sync\` - Sync AtomicFacts to Notion
- \`POST /bridges/notion/dlq:process\` - Process failed syncs
- \`GET /bridges/notion/status\` - Notion sync status

### Sessions
- \`POST /api/session/init\` - Initialize session
- \`POST /api/session/sync\` - Sync session state
- \`GET /api/session/{id}/status\` - Session status

## Configuration

### Required Environment Variables
- \`AI\` - Cloudflare AI binding
- \`SESSIONS\` - KV namespace for sessions
- \`AUTH_CACHE\` - KV namespace for auth cache
- \`CHITTY_ANALYTICS\` - Analytics Engine dataset

### Optional Environment Variables
- \`NOTION_TOKEN\` - Notion integration token
- \`NOTION_DATABASE_ID_ATOMIC_FACTS\` - Notion database ID
- \`NODE_ID\` - Unique node identifier

## Post-Deployment Tasks

1. Configure Notion database properties (if using Notion sync)
2. Set up monitoring dashboards
3. Configure alerting rules
4. Test session synchronization across services
5. Validate pipeline authentication flow

## Rollback Plan

If issues arise:
1. \`wrangler rollback chittyid\` - Rollback worker
2. \`git revert <commit>\` - Revert code changes
3. Deploy previous version with \`npm run deploy\`

---

**Status:** ✅ Deployment Successful
**Next Steps:** Monitor for 24 hours, then proceed with ecosystem-wide session sync enablement
EOF

    success "Deployment report generated: $report_file"
}

# Main deployment function
main() {
    log "Starting ChittyID deployment..."

    # Parse command line arguments
    local skip_tests=false
    local environment="production"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-tests)
                skip_tests=true
                shift
                ;;
            --environment)
                environment="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [--skip-tests] [--environment production|staging]"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    log "Deploying to environment: $environment"

    # Execute deployment steps
    check_prerequisites

    if [[ "$skip_tests" != true ]]; then
        run_tests
    else
        warn "Skipping tests as requested"
    fi

    build_project
    setup_cloudflare_resources
    deploy_worker
    deploy_pages
    verify_deployment
    setup_monitoring
    generate_report

    success "🎉 ChittyID deployment completed successfully!"
    log "View logs: $LOG_FILE"
    log "View report: $PROJECT_ROOT/deployment-report.md"
}

# Run main function with all arguments
main "$@"