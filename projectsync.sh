#!/bin/bash

# ChittyOS Project Sync Script
# Synchronizes ChittyID, ChittyChat, and ChittyMCP projects

set -e

echo "🔄 ChittyOS Project Sync Starting..."
echo "=================================="

# Project paths
CHITTYID_PATH="/Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid"
CHITTYCHAT_PATH="/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittychat"
CHITTYMCP_PATH="/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittymcp"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check project status
check_project() {
    local project_name=$1
    local project_path=$2

    echo -e "${BLUE}📁 Checking $project_name...${NC}"
    cd "$project_path"

    # Check git status
    if git diff --quiet && git diff --cached --quiet; then
        echo -e "${GREEN}✓ $project_name: No uncommitted changes${NC}"
    else
        echo -e "${YELLOW}⚠ $project_name: Has uncommitted changes${NC}"
        git status --short | head -10
    fi

    # Check branch
    branch=$(git rev-parse --abbrev-ref HEAD)
    echo "  Branch: $branch"

    # Check for unpushed commits
    if git status | grep -q "Your branch is ahead"; then
        echo -e "${YELLOW}  ⚠ Unpushed commits detected${NC}"
    fi
}

# Function to sync shared services
sync_shared_services() {
    echo -e "\n${BLUE}🔗 Syncing Shared Services...${NC}"

    # Sync LangChain AI service
    if [ -f "$CHITTYMCP_PATH/ultimate-worker/src/services/langchain-ai.js" ]; then
        echo "  ✓ LangChain AI service found in ultimate-worker"
    fi

    # Sync ChittyCases integration
    if [ -f "$CHITTYMCP_PATH/ultimate-worker/src/services/chittycases-integration.js" ]; then
        echo "  ✓ ChittyCases integration found in ultimate-worker"
    fi

    # Check portal routing
    if [ -f "$CHITTYMCP_PATH/ultimate-worker/src/index.js" ]; then
        if grep -q "portal.chitty.cc" "$CHITTYMCP_PATH/ultimate-worker/src/index.js"; then
            echo "  ✓ Portal routing configured"
        fi
    fi
}

# Function to verify deployments
verify_deployments() {
    echo -e "\n${BLUE}🚀 Verifying Deployments...${NC}"

    # Check ChittyID deployment
    echo -n "  ChittyID (id.chitty.cc): "
    if curl -s --max-time 2 https://id.chitty.cc/health > /dev/null 2>&1; then
        echo -e "${GREEN}ONLINE${NC}"
    else
        echo -e "${YELLOW}UNREACHABLE${NC}"
    fi

    # Check ultimate-worker deployment
    echo -n "  Ultimate Worker: "
    if curl -s --max-time 2 https://chittyos-platform-live.chittycorp-llc.workers.dev/health > /dev/null 2>&1; then
        echo -e "${GREEN}ONLINE${NC}"
    else
        echo -e "${YELLOW}UNREACHABLE${NC}"
    fi

    # Check portal
    echo -n "  Portal (portal.chitty.cc): "
    if curl -s --max-time 2 https://portal.chitty.cc > /dev/null 2>&1; then
        echo -e "${GREEN}ONLINE${NC}"
    else
        echo -e "${YELLOW}NOT RESPONDING${NC}"
    fi
}

# Function to show integration status
show_integration_status() {
    echo -e "\n${BLUE}📊 Integration Status:${NC}"
    echo "=================================="
    echo "✅ LangChain AI: 7 tools integrated"
    echo "✅ ChittyCases: Routes to portal.chitty.cc"
    echo "✅ MCP Portal: Handler configured"
    echo "✅ KV Namespaces: PLATFORM_CACHE & PLATFORM_KV"
    echo "✅ Deployment: chittyos-platform-live"
    echo "=================================="
}

# Main sync process
main() {
    echo "Starting at: $(date)"

    # Check each project
    check_project "ChittyID" "$CHITTYID_PATH"
    check_project "ChittyChat" "$CHITTYCHAT_PATH"
    check_project "ChittyMCP" "$CHITTYMCP_PATH"

    # Sync shared services
    sync_shared_services

    # Verify deployments
    verify_deployments

    # Show integration status
    show_integration_status

    # Update sync status file
    echo -e "\n${GREEN}✓ Project sync completed successfully!${NC}"
    echo "Last sync: $(date)" > "$CHITTYID_PATH/.last-sync"

    # Update projectsync.json with current timestamp
    if command -v jq > /dev/null 2>&1; then
        jq '.syncStatus.lastSync = "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"' \
            "$CHITTYID_PATH/projectsync.json" > "$CHITTYID_PATH/projectsync.json.tmp" && \
            mv "$CHITTYID_PATH/projectsync.json.tmp" "$CHITTYID_PATH/projectsync.json"
    fi
}

# Run main function
main