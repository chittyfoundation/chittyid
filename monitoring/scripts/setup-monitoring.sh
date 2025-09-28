#!/bin/bash

# ChittyID Monitoring Setup Script
# Sets up comprehensive monitoring infrastructure

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

# Check prerequisites
check_prerequisites() {
    log "Checking monitoring setup prerequisites..."

    local tools=("docker" "docker-compose" "curl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is required but not installed"
        fi
    done

    if ! docker info &> /dev/null; then
        error "Docker is not running"
    fi

    success "Prerequisites check passed"
}

# Setup environment variables
setup_environment() {
    log "Setting up monitoring environment..."

    # Create .env file if it doesn't exist
    if [[ ! -f .env.monitoring ]]; then
        cat > .env.monitoring << 'EOF'
# ChittyID Monitoring Configuration

# SMTP Configuration
GRAFANA_SMTP_USER=alerts@chitty.cc
GRAFANA_SMTP_PASSWORD=your-smtp-password-here

# AlertManager Configuration
ALERTMANAGER_SMTP_PASSWORD=your-smtp-password-here
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# PagerDuty Integration
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-key-here

# External Services
CHITTY_METRICS_TOKEN=your-metrics-token-here
CLOUDFLARE_API_TOKEN=your-cloudflare-token-here

# Grafana Admin
GF_SECURITY_ADMIN_PASSWORD=secure-admin-password
EOF
        warn "Created .env.monitoring - Please configure with actual values"
    fi

    success "Environment configuration ready"
}

# Create monitoring directories
create_directories() {
    log "Creating monitoring directory structure..."

    local dirs=(
        "data/prometheus"
        "data/grafana"
        "data/alertmanager"
        "data/loki"
        "logs"
        "grafana/provisioning/dashboards"
        "grafana/provisioning/datasources"
        "nginx/ssl"
        "blackbox"
        "loki"
        "promtail"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
    done

    # Set proper permissions
    chmod 777 data/prometheus data/grafana data/alertmanager data/loki

    success "Directory structure created"
}

# Setup Grafana provisioning
setup_grafana_provisioning() {
    log "Setting up Grafana provisioning..."

    # Datasources configuration
    cat > grafana/provisioning/datasources/datasources.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: true

  - name: Jaeger
    type: jaeger
    access: proxy
    url: http://jaeger:16686
    editable: true
EOF

    # Dashboards configuration
    cat > grafana/provisioning/dashboards/dashboards.yml << 'EOF'
apiVersion: 1

providers:
  - name: 'ChittyID Dashboards'
    orgId: 1
    folder: 'ChittyID'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF

    success "Grafana provisioning configured"
}

# Setup Nginx reverse proxy
setup_nginx() {
    log "Setting up Nginx reverse proxy..."

    cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream grafana {
        server grafana:3000;
    }

    upstream prometheus {
        server prometheus:9090;
    }

    upstream alertmanager {
        server alertmanager:9093;
    }

    server {
        listen 80;
        server_name grafana.chitty.cc;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name grafana.chitty.cc;

        ssl_certificate /etc/nginx/ssl/grafana.crt;
        ssl_certificate_key /etc/nginx/ssl/grafana.key;

        location / {
            proxy_pass http://grafana;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    server {
        listen 80;
        server_name prometheus.chitty.cc;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name prometheus.chitty.cc;

        ssl_certificate /etc/nginx/ssl/prometheus.crt;
        ssl_certificate_key /etc/nginx/ssl/prometheus.key;

        location / {
            proxy_pass http://prometheus;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }

    server {
        listen 80;
        server_name alerts.chitty.cc;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name alerts.chitty.cc;

        ssl_certificate /etc/nginx/ssl/alerts.crt;
        ssl_certificate_key /etc/nginx/ssl/alerts.key;

        location / {
            proxy_pass http://alertmanager;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
EOF

    success "Nginx configuration created"
}

# Setup blackbox exporter
setup_blackbox() {
    log "Setting up blackbox exporter..."

    cat > blackbox/blackbox.yml << 'EOF'
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: []
      method: GET
      follow_redirects: true
      preferred_ip_protocol: "ip4"

  http_post_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: []
      method: POST
      headers:
        Content-Type: application/json
      body: '{"test": true}'

  chittyid_api:
    prober: http
    timeout: 10s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200, 401]
      method: GET
      headers:
        User-Agent: "ChittyID-Monitor/1.0"
EOF

    success "Blackbox exporter configured"
}

# Setup Loki
setup_loki() {
    log "Setting up Loki..."

    cat > loki/loki-config.yml << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2023-01-01
      store: boltdb
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 168h

storage_config:
  boltdb:
    directory: /loki/index
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
EOF

    success "Loki configured"
}

# Setup Promtail
setup_promtail() {
    log "Setting up Promtail..."

    cat > promtail/promtail-config.yml << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: containerlogs
          __path__: /var/lib/docker/containers/*/*log

    pipeline_stages:
      - json:
          expressions:
            output: log
            stream: stream
            attrs:
      - json:
          source: attrs
          expressions:
            tag:
      - regex:
          source: tag
          expression: '^(?P<container_name>[a-zA-Z0-9_-]+)-(?P<container_id>[a-f0-9]{12})$'
      - timestamp:
          source: time
          format: RFC3339Nano
      - labels:
          stream:
          container_name:
          container_id:
      - output:
          source: output

  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: systemlogs
          __path__: /var/log/*.log
EOF

    success "Promtail configured"
}

# Generate SSL certificates (self-signed for development)
generate_ssl_certificates() {
    log "Generating SSL certificates..."

    if [[ ! -f nginx/ssl/grafana.crt ]]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/grafana.key \
            -out nginx/ssl/grafana.crt \
            -subj "/CN=grafana.chitty.cc"
    fi

    if [[ ! -f nginx/ssl/prometheus.crt ]]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/prometheus.key \
            -out nginx/ssl/prometheus.crt \
            -subj "/CN=prometheus.chitty.cc"
    fi

    if [[ ! -f nginx/ssl/alerts.crt ]]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/alerts.key \
            -out nginx/ssl/alerts.crt \
            -subj "/CN=alerts.chitty.cc"
    fi

    success "SSL certificates generated"
}

# Start monitoring stack
start_monitoring() {
    log "Starting monitoring stack..."

    # Load environment variables
    set -a
    source .env.monitoring 2>/dev/null || true
    set +a

    # Start services
    docker-compose up -d

    # Wait for services to be ready
    log "Waiting for services to start..."
    sleep 30

    # Check service health
    local services=("prometheus:9090" "grafana:3000" "alertmanager:9093")
    for service in "${services[@]}"; do
        local name=$(echo "$service" | cut -d: -f1)
        local port=$(echo "$service" | cut -d: -f2)

        if curl -f -s "http://localhost:$port" > /dev/null; then
            success "$name is running on port $port"
        else
            warn "$name may not be ready yet on port $port"
        fi
    done

    success "Monitoring stack started"
}

# Import Grafana dashboards
import_dashboards() {
    log "Importing Grafana dashboards..."

    # Wait for Grafana to be ready
    local retries=0
    while ! curl -f -s http://admin:admin@localhost:3000/api/health > /dev/null; do
        if [[ $retries -ge 30 ]]; then
            error "Grafana not ready after 30 attempts"
        fi
        log "Waiting for Grafana... (attempt $((++retries)))"
        sleep 2
    done

    # Import main dashboard
    if [[ -f dashboards/grafana-chittyid.json ]]; then
        curl -X POST \
            -H "Content-Type: application/json" \
            -u admin:admin \
            -d @dashboards/grafana-chittyid.json \
            http://localhost:3000/api/dashboards/db
        success "ChittyID dashboard imported"
    fi

    success "Dashboard import completed"
}

# Print access information
print_access_info() {
    log "Monitoring Setup Complete!"
    echo
    echo "📊 Access URLs:"
    echo "   Grafana:      http://localhost:3000 (admin/admin)"
    echo "   Prometheus:   http://localhost:9090"
    echo "   AlertManager: http://localhost:9093"
    echo "   Jaeger:       http://localhost:16686"
    echo
    echo "🔧 Management Commands:"
    echo "   docker-compose logs -f          # View all logs"
    echo "   docker-compose logs grafana     # View Grafana logs"
    echo "   docker-compose restart          # Restart all services"
    echo "   docker-compose down             # Stop all services"
    echo
    echo "📁 Configuration Files:"
    echo "   .env.monitoring                 # Environment variables"
    echo "   metrics/prometheus.yml          # Prometheus configuration"
    echo "   dashboards/grafana-chittyid.json # Main dashboard"
    echo "   alerts/chittyid-alerts.yml      # Alert rules"
    echo
    echo "🔔 Next Steps:"
    echo "1. Configure .env.monitoring with actual credentials"
    echo "2. Update Slack webhook URLs for alerts"
    echo "3. Configure SMTP settings for email alerts"
    echo "4. Set up DNS entries for monitoring domains"
    echo "5. Replace self-signed certificates with valid ones"
    echo
}

# Main setup function
main() {
    log "Starting ChittyID monitoring setup..."

    local skip_start=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-start)
                skip_start=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--skip-start]"
                echo "  --skip-start  Setup configuration but don't start services"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    check_prerequisites
    setup_environment
    create_directories
    setup_grafana_provisioning
    setup_nginx
    setup_blackbox
    setup_loki
    setup_promtail
    generate_ssl_certificates

    if [[ "$skip_start" != true ]]; then
        start_monitoring
        import_dashboards
    fi

    print_access_info

    success "🎉 ChittyID monitoring setup completed!"
}

# Run main function with all arguments
main "$@"