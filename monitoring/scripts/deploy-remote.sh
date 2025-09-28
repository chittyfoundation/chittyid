#!/bin/bash

# ChittyID Remote Monitoring Deployment Script
# Deploys monitoring infrastructure to remote servers

set -euo pipefail

# Configuration
REMOTE_HOST="${1:-monitor.chitty.cc}"
REMOTE_USER="${2:-ubuntu}"
REMOTE_PATH="/opt/chittyid-monitoring"
LOCAL_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

# Check SSH connection
check_ssh() {
    log "Checking SSH connection to $REMOTE_HOST..."

    if ! ssh -o ConnectTimeout=5 "$REMOTE_USER@$REMOTE_HOST" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        error "Cannot connect to $REMOTE_HOST. Check SSH configuration."
    fi

    success "SSH connection verified"
}

# Check remote prerequisites
check_remote_prerequisites() {
    log "Checking remote server prerequisites..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        # Check for Docker
        if ! command -v docker &> /dev/null; then
            echo "Installing Docker..."
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker $USER
        fi

        # Check for Docker Compose
        if ! command -v docker-compose &> /dev/null; then
            echo "Installing Docker Compose..."
            sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
        fi

        # Check for required tools
        for tool in curl jq git; do
            if ! command -v $tool &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y $tool
            fi
        done
EOF

    success "Remote prerequisites installed"
}

# Create remote directory structure
create_remote_directories() {
    log "Creating remote directory structure..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << EOF
        sudo mkdir -p $REMOTE_PATH
        sudo chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_PATH

        cd $REMOTE_PATH
        mkdir -p {data,logs,backups}
        mkdir -p data/{prometheus,grafana,alertmanager,loki,redis}
        mkdir -p grafana/provisioning/{dashboards,datasources}
        mkdir -p nginx/{ssl,conf.d}
        chmod -R 755 $REMOTE_PATH
EOF

    success "Remote directories created"
}

# Sync monitoring configuration
sync_configuration() {
    log "Syncing monitoring configuration to remote server..."

    # Create tar archive of monitoring files
    cd "$LOCAL_PATH"
    tar czf /tmp/monitoring-config.tar.gz \
        --exclude='data' \
        --exclude='logs' \
        --exclude='*.log' \
        --exclude='.git' \
        .

    # Transfer archive to remote
    scp /tmp/monitoring-config.tar.gz "$REMOTE_USER@$REMOTE_HOST:/tmp/"

    # Extract on remote
    ssh "$REMOTE_USER@$REMOTE_HOST" << EOF
        cd $REMOTE_PATH
        tar xzf /tmp/monitoring-config.tar.gz
        rm /tmp/monitoring-config.tar.gz
EOF

    # Clean up local archive
    rm /tmp/monitoring-config.tar.gz

    success "Configuration synced to remote server"
}

# Setup SSL certificates
setup_ssl() {
    log "Setting up SSL certificates on remote server..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        cd /opt/chittyid-monitoring

        # Install certbot if not present
        if ! command -v certbot &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y certbot
        fi

        # Generate certificates for each subdomain
        DOMAINS=(
            "grafana.chitty.cc"
            "prometheus.chitty.cc"
            "alerts.chitty.cc"
            "monitor.chitty.cc"
        )

        for domain in "${DOMAINS[@]}"; do
            if [[ ! -f "nginx/ssl/${domain}.crt" ]]; then
                # Try to get Let's Encrypt cert
                sudo certbot certonly --standalone -d "$domain" \
                    --non-interactive --agree-tos \
                    --email ops@chitty.cc || {
                    # Fallback to self-signed if Let's Encrypt fails
                    echo "Generating self-signed certificate for $domain"
                    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                        -keyout "nginx/ssl/${domain}.key" \
                        -out "nginx/ssl/${domain}.crt" \
                        -subj "/CN=${domain}"
                }

                # Copy Let's Encrypt certs if they exist
                if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
                    sudo cp "/etc/letsencrypt/live/${domain}/fullchain.pem" "nginx/ssl/${domain}.crt"
                    sudo cp "/etc/letsencrypt/live/${domain}/privkey.pem" "nginx/ssl/${domain}.key"
                    sudo chown $USER:$USER nginx/ssl/${domain}.*
                fi
            fi
        done
EOF

    success "SSL certificates configured"
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall rules..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        # Enable UFW if not already enabled
        sudo ufw --force enable

        # Allow SSH
        sudo ufw allow 22/tcp

        # Allow HTTP and HTTPS
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp

        # Allow monitoring ports (restricted to internal network)
        # Prometheus
        sudo ufw allow from 10.0.0.0/8 to any port 9090

        # Grafana
        sudo ufw allow from 10.0.0.0/8 to any port 3000

        # AlertManager
        sudo ufw allow from 10.0.0.0/8 to any port 9093

        # Node Exporter
        sudo ufw allow from 10.0.0.0/8 to any port 9100

        # Reload firewall
        sudo ufw reload
EOF

    success "Firewall configured"
}

# Create production docker-compose override
create_production_compose() {
    log "Creating production Docker Compose configuration..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        cd /opt/chittyid-monitoring

        cat > docker-compose.production.yml << 'COMPOSE'
version: '3.8'

services:
  prometheus:
    restart: always
    volumes:
      - /opt/chittyid-monitoring/data/prometheus:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=90d'
      - '--storage.tsdb.retention.size=50GB'
      - '--web.enable-lifecycle'
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

  grafana:
    restart: always
    volumes:
      - /opt/chittyid-monitoring/data/grafana:/var/lib/grafana
    environment:
      - GF_SERVER_ROOT_URL=https://grafana.chitty.cc
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_AUTH_ANONYMOUS_ENABLED=false
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_INSTALL_PLUGINS=redis-app,redis-datasource
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G

  alertmanager:
    restart: always
    volumes:
      - /opt/chittyid-monitoring/data/alertmanager:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=https://alerts.chitty.cc'
      - '--cluster.listen-address=0.0.0.0:9094'
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M

  nginx:
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /opt/chittyid-monitoring/nginx/ssl:/etc/nginx/ssl:ro
      - /opt/chittyid-monitoring/nginx/conf.d:/etc/nginx/conf.d:ro
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  redis:
    restart: always
    volumes:
      - /opt/chittyid-monitoring/data/redis:/data
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G

  node-exporter:
    restart: always
    pid: host
    network_mode: host
    volumes:
      - /:/host:ro,rslave

  backup:
    image: alpine:latest
    restart: always
    volumes:
      - /opt/chittyid-monitoring:/monitoring:ro
      - /opt/chittyid-monitoring/backups:/backups
    command: |
      sh -c 'while true; do
        tar czf /backups/monitoring-backup-$$(date +%Y%m%d-%H%M%S).tar.gz \
          /monitoring/data/prometheus \
          /monitoring/data/grafana \
          /monitoring/data/alertmanager
        find /backups -name "*.tar.gz" -mtime +7 -delete
        sleep 86400
      done'
COMPOSE
EOF

    success "Production configuration created"
}

# Setup environment variables
setup_production_env() {
    log "Setting up production environment variables..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        cd /opt/chittyid-monitoring

        if [[ ! -f .env ]]; then
            cat > .env << 'ENV'
# ChittyID Production Monitoring Configuration

# Grafana
GRAFANA_ADMIN_PASSWORD=ChangeMeToSecurePassword
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_EMAIL=admin@chitty.cc

# SMTP Configuration
GRAFANA_SMTP_USER=alerts@chitty.cc
GRAFANA_SMTP_PASSWORD=your-smtp-password
SMTP_SMART_HOST=smtp.gmail.com:587

# AlertManager
ALERTMANAGER_SMTP_PASSWORD=your-smtp-password
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK

# PagerDuty
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-key

# External APIs
CLOUDFLARE_API_TOKEN=your-cloudflare-token
CHITTY_METRICS_TOKEN=your-metrics-token

# Monitoring
MONITORING_DOMAIN=monitor.chitty.cc
GRAFANA_DOMAIN=grafana.chitty.cc
PROMETHEUS_DOMAIN=prometheus.chitty.cc
ALERTMANAGER_DOMAIN=alerts.chitty.cc
ENV

            echo "IMPORTANT: Edit .env file with actual credentials"
        fi

        chmod 600 .env
EOF

    success "Environment variables configured"
}

# Deploy monitoring stack
deploy_monitoring() {
    log "Deploying monitoring stack on remote server..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        cd /opt/chittyid-monitoring

        # Load environment variables
        set -a
        source .env
        set +a

        # Pull latest images
        docker-compose pull

        # Start services with production overrides
        docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d

        # Wait for services to start
        sleep 30

        # Check service health
        docker-compose ps
EOF

    success "Monitoring stack deployed"
}

# Setup systemd service
setup_systemd() {
    log "Setting up systemd service..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        sudo tee /etc/systemd/system/chittyid-monitoring.service > /dev/null << 'SERVICE'
[Unit]
Description=ChittyID Monitoring Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=ubuntu
WorkingDirectory=/opt/chittyid-monitoring
ExecStart=/usr/local/bin/docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d
ExecStop=/usr/local/bin/docker-compose down
ExecReload=/usr/local/bin/docker-compose restart
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SERVICE

        sudo systemctl daemon-reload
        sudo systemctl enable chittyid-monitoring.service
        sudo systemctl start chittyid-monitoring.service
EOF

    success "Systemd service configured"
}

# Setup monitoring backup
setup_backup() {
    log "Setting up automated backups..."

    ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        # Create backup script
        cat > /opt/chittyid-monitoring/backup.sh << 'BACKUP'
#!/bin/bash
BACKUP_DIR="/opt/chittyid-monitoring/backups"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/monitoring-$DATE.tar.gz"

# Create backup
cd /opt/chittyid-monitoring
tar czf "$BACKUP_FILE" \
    data/prometheus \
    data/grafana \
    data/alertmanager \
    data/loki

# Upload to S3 (if configured)
if [[ -n "$AWS_S3_BUCKET" ]]; then
    aws s3 cp "$BACKUP_FILE" "s3://$AWS_S3_BUCKET/monitoring-backups/"
fi

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
BACKUP

        chmod +x /opt/chittyid-monitoring/backup.sh

        # Add cron job for daily backups
        (crontab -l 2>/dev/null; echo "0 2 * * * /opt/chittyid-monitoring/backup.sh") | crontab -
EOF

    success "Backup system configured"
}

# Verify deployment
verify_deployment() {
    log "Verifying remote deployment..."

    # Check service endpoints
    local endpoints=(
        "https://grafana.chitty.cc"
        "https://prometheus.chitty.cc"
        "https://alerts.chitty.cc"
    )

    for endpoint in "${endpoints[@]}"; do
        if curl -k -f -s "$endpoint" > /dev/null 2>&1; then
            success "$endpoint is accessible"
        else
            warn "$endpoint may not be ready yet"
        fi
    done

    # Check Docker containers
    ssh "$REMOTE_USER@$REMOTE_HOST" "cd /opt/chittyid-monitoring && docker-compose ps"

    success "Deployment verification completed"
}

# Print deployment summary
print_summary() {
    echo
    log "🎉 Remote Monitoring Deployment Complete!"
    echo
    echo "📊 Access URLs:"
    echo "   Grafana:      https://grafana.chitty.cc"
    echo "   Prometheus:   https://prometheus.chitty.cc"
    echo "   AlertManager: https://alerts.chitty.cc"
    echo
    echo "🔧 Remote Management:"
    echo "   SSH: ssh $REMOTE_USER@$REMOTE_HOST"
    echo "   Logs: ssh $REMOTE_USER@$REMOTE_HOST 'cd /opt/chittyid-monitoring && docker-compose logs -f'"
    echo "   Status: ssh $REMOTE_USER@$REMOTE_HOST 'systemctl status chittyid-monitoring'"
    echo
    echo "📁 Remote Paths:"
    echo "   Configuration: /opt/chittyid-monitoring"
    echo "   Data: /opt/chittyid-monitoring/data"
    echo "   Backups: /opt/chittyid-monitoring/backups"
    echo
    echo "⚠️  Important Next Steps:"
    echo "1. Edit /opt/chittyid-monitoring/.env with actual credentials"
    echo "2. Configure DNS records for monitoring domains"
    echo "3. Update SSL certificates if using self-signed"
    echo "4. Configure backup destination (S3, etc.)"
    echo "5. Set up VPN access if restricting monitoring access"
    echo
}

# Main deployment function
main() {
    log "Starting remote monitoring deployment..."

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: $0 [REMOTE_HOST] [REMOTE_USER]"
                echo "  REMOTE_HOST  Remote server hostname (default: monitor.chitty.cc)"
                echo "  REMOTE_USER  Remote user (default: ubuntu)"
                echo
                echo "Example: $0 monitor.chitty.cc ubuntu"
                exit 0
                ;;
            *)
                break
                ;;
        esac
    done

    log "Deploying to: $REMOTE_USER@$REMOTE_HOST"

    # Execute deployment steps
    check_ssh
    check_remote_prerequisites
    create_remote_directories
    sync_configuration
    setup_ssl
    configure_firewall
    create_production_compose
    setup_production_env
    deploy_monitoring
    setup_systemd
    setup_backup
    verify_deployment
    print_summary

    success "Remote deployment completed successfully!"
}

# Run main function with all arguments
main "$@"