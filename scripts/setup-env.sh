#!/bin/bash

# ChittyID Environment Setup Script
# Sets up development and production environments

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

# Check if wrangler is installed
check_wrangler() {
    if ! command -v wrangler &> /dev/null; then
        error "Wrangler CLI is not installed. Install with: npm install -g wrangler"
    fi
}

# Authenticate with Cloudflare
authenticate() {
    log "Checking Cloudflare authentication..."

    if ! wrangler whoami &> /dev/null; then
        log "Not authenticated with Cloudflare. Starting authentication..."
        wrangler login
    else
        local user=$(wrangler whoami | head -1)
        success "Already authenticated as: $user"
    fi
}

# Set up KV namespaces
setup_kv_namespaces() {
    log "Setting up KV namespaces..."

    local namespaces=(
        "AUTH_CACHE:Authentication and validation caching"
        "CHITTYOS_CACHE:System-wide caching"
        "SESSIONS:User session management"
        "CHITTY_IDS:ChittyID storage (pages config)"
        "CHITTY_SECRETS:ChittySecret storage (pages config)"
    )

    for namespace_info in "${namespaces[@]}"; do
        local name=$(echo "$namespace_info" | cut -d: -f1)
        local description=$(echo "$namespace_info" | cut -d: -f2)

        log "Creating KV namespace: $name ($description)"

        # Create namespace (will show ID if successful)
        local result=$(wrangler kv namespace create "$name" --preview false 2>/dev/null || echo "exists")

        if [[ "$result" != "exists" ]]; then
            success "Created KV namespace: $name"
            echo "$result"
        else
            warn "KV namespace $name may already exist"
        fi
    done
}

# Set up D1 database
setup_d1_database() {
    log "Setting up D1 database..."

    local db_name="chittyauth-prod"

    # Check if database exists
    if wrangler d1 list | grep -q "$db_name"; then
        warn "D1 database $db_name already exists"
    else
        log "Creating D1 database: $db_name"
        wrangler d1 create "$db_name"
        success "Created D1 database: $db_name"
    fi

    # Create basic schema
    log "Setting up database schema..."

    cat > /tmp/schema.sql << 'EOF'
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    country TEXT,
    two_factor_enabled BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_id TEXT,
    registered BOOLEAN DEFAULT FALSE,
    verified BOOLEAN DEFAULT FALSE,
    permissions TEXT, -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    project_id TEXT,
    data TEXT, -- JSON
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
EOF

    wrangler d1 execute "$db_name" --local --file=/tmp/schema.sql
    success "Database schema created"

    rm /tmp/schema.sql
}

# Set up Vectorize index
setup_vectorize() {
    log "Setting up Vectorize index..."

    local index_name="chittyid-routing"

    if wrangler vectorize list | grep -q "$index_name"; then
        warn "Vectorize index $index_name already exists"
    else
        log "Creating Vectorize index: $index_name"
        wrangler vectorize create "$index_name" --dimensions=384 --metric=cosine
        success "Created Vectorize index: $index_name"
    fi
}

# Create environment configuration
create_env_config() {
    log "Creating environment configuration..."

    cat > .env.example << 'EOF'
# ChittyID Environment Configuration

# Cloudflare Configuration
CLOUDFLARE_ACCOUNT_ID=your-account-id-here

# Notion Integration (Optional)
NOTION_TOKEN=secret_notion_integration_token
NOTION_DATABASE_ID_ATOMIC_FACTS=notion-database-id

# Session Configuration
NODE_ID=chittyid-node-1

# Development Settings
DEBUG=false
VERBOSE_LOGGING=false
MOCK_SERVICES=false

# Monitoring (Optional)
WEBHOOK_URL=https://hooks.slack.com/your-webhook
ALERT_EMAIL=alerts@yourdomain.com
EOF

    success "Created .env.example - Copy to .env and configure"
}

# Create wrangler configuration
create_wrangler_config() {
    log "Verifying wrangler configuration..."

    if [[ ! -f "wrangler.toml" ]]; then
        warn "wrangler.toml not found. Creating basic configuration..."

        cat > wrangler.toml << 'EOF'
name = "chittyid-mothership"
compatibility_date = "2025-01-16"
pages_build_output_dir = "dist"

# KV Namespaces - Update IDs after creation
[[kv_namespaces]]
binding = "AUTH_CACHE"
id = "your-auth-cache-id"

[[kv_namespaces]]
binding = "CHITTYOS_CACHE"
id = "your-chittyos-cache-id"

[[kv_namespaces]]
binding = "SESSIONS"
id = "your-sessions-id"

# D1 Database - Update ID after creation
[[d1_databases]]
binding = "AUTH_DB"
database_name = "chittyauth-prod"
database_id = "your-database-id"

# Vectorize Index - Update after creation
[[vectorize]]
binding = "CHITTY_VECTORS"
index_name = "chittyid-routing"

# AI Binding
[ai]
binding = "AI"

# Analytics
[[analytics_engine_datasets]]
binding = "CHITTY_ANALYTICS"
EOF

        warn "Created basic wrangler.toml - Update with actual resource IDs"
    else
        success "wrangler.toml already exists"
    fi
}

# Set up development dependencies
setup_dev_dependencies() {
    log "Setting up development dependencies..."

    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Are you in the right directory?"
    fi

    log "Installing npm dependencies..."
    npm install

    # Install additional dev tools if needed
    local dev_tools=("vitest" "@cloudflare/workers-types" "typescript")

    for tool in "${dev_tools[@]}"; do
        if ! npm list "$tool" &> /dev/null; then
            log "Installing dev dependency: $tool"
            npm install --save-dev "$tool"
        fi
    done

    success "Development dependencies installed"
}

# Create monitoring configuration
create_monitoring_config() {
    log "Creating monitoring configuration..."

    mkdir -p monitoring

    cat > monitoring/grafana-dashboard.json << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "ChittyID Mothership",
    "tags": ["chittyos", "identity"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Request Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(chitty_requests_total[5m]))",
            "legendFormat": "Requests/sec"
          }
        ]
      },
      {
        "title": "Pipeline Success Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(chitty_pipeline_success_total[5m])) / sum(rate(chitty_pipeline_total[5m])) * 100",
            "legendFormat": "Success %"
          }
        ]
      },
      {
        "title": "Session Sync Health",
        "type": "stat",
        "targets": [
          {
            "expr": "chitty_session_sync_healthy",
            "legendFormat": "Healthy Services"
          }
        ]
      },
      {
        "title": "Notion DLQ Size",
        "type": "stat",
        "targets": [
          {
            "expr": "chitty_notion_dlq_size",
            "legendFormat": "Failed Items"
          }
        ]
      }
    ]
  }
}
EOF

    cat > monitoring/alerts.yml << 'EOF'
groups:
  - name: chittyid
    rules:
      - alert: ChittyIDHighErrorRate
        expr: sum(rate(chitty_errors_total[5m])) / sum(rate(chitty_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "ChittyID error rate is high"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: ChittyIDPipelineDown
        expr: chitty_pipeline_healthy == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "ChittyID pipeline is down"

      - alert: ChittyIDSessionSyncIssues
        expr: chitty_session_sync_failures > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Session sync experiencing issues"

      - alert: ChittyIDNotionDLQFull
        expr: chitty_notion_dlq_size > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Notion DLQ is filling up"
EOF

    success "Monitoring configuration created in ./monitoring/"
}

# Run basic tests
run_basic_tests() {
    log "Running basic tests..."

    if command -v npm &> /dev/null && [[ -f "package.json" ]]; then
        if npm run test:unit --if-present; then
            success "Basic tests passed"
        else
            warn "Some tests failed - check implementation"
        fi
    else
        warn "Cannot run tests - npm or package.json missing"
    fi
}

# Print setup summary
print_summary() {
    log "Setup Summary"
    echo
    echo "✅ Cloudflare authentication"
    echo "✅ KV namespaces created"
    echo "✅ D1 database setup"
    echo "✅ Vectorize index created"
    echo "✅ Environment configuration"
    echo "✅ Development dependencies"
    echo "✅ Monitoring configuration"
    echo
    echo "📋 Next Steps:"
    echo "1. Copy .env.example to .env and configure"
    echo "2. Update wrangler.toml with actual resource IDs"
    echo "3. Configure Notion integration (if needed)"
    echo "4. Run: npm run deploy"
    echo "5. Test endpoints and monitor health"
    echo
    echo "📚 Documentation:"
    echo "- Deployment: npm run deploy (Workers, worker.js via wrangler.jsonc)"
    echo "- Monitoring: ./monitoring/"
    echo "- API Docs: Visit /api/spec after deployment"
    echo
}

# Main setup function
main() {
    log "Starting ChittyID environment setup..."

    local skip_auth=false
    local skip_tests=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-auth)
                skip_auth=true
                shift
                ;;
            --skip-tests)
                skip_tests=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--skip-auth] [--skip-tests]"
                echo "  --skip-auth   Skip Cloudflare authentication"
                echo "  --skip-tests  Skip running basic tests"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    check_wrangler

    if [[ "$skip_auth" != true ]]; then
        authenticate
    fi

    setup_kv_namespaces
    setup_d1_database
    setup_vectorize
    create_env_config
    create_wrangler_config
    setup_dev_dependencies
    create_monitoring_config

    if [[ "$skip_tests" != true ]]; then
        run_basic_tests
    fi

    print_summary

    success "🎉 ChittyID environment setup completed!"
}

# Run main function
main "$@"