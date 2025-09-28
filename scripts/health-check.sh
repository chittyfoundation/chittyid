#!/bin/bash

# ChittyID Health Check Script
# Comprehensive health monitoring for the deployed system

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${CHITTYID_URL:-https://id.chitty.cc}"
LOG_FILE="${LOG_FILE:-/tmp/chittyid-health.log}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Test endpoint with timeout
test_endpoint() {
    local url="$1"
    local expected_status="${2:-200}"
    local timeout="${3:-10}"
    local description="${4:-$url}"

    log_info "Testing: $description"

    local start_time=$(date +%s.%N)
    local response
    local status_code

    if response=$(curl -s -w "\n%{http_code}" --max-time "$timeout" "$url" 2>/dev/null); then
        status_code=$(echo "$response" | tail -n1)
        local body=$(echo "$response" | head -n -1)
        local end_time=$(date +%s.%N)
        local duration=$(echo "$end_time - $start_time" | bc -l)
        local duration_ms=$(printf "%.0f" $(echo "$duration * 1000" | bc -l))

        if [[ "$status_code" == "$expected_status" ]]; then
            log_success "✓ $description (${duration_ms}ms, status: $status_code)"
            return 0
        else
            log_warning "✗ $description (${duration_ms}ms, status: $status_code, expected: $expected_status)"
            return 1
        fi
    else
        log_error "✗ $description (timeout or connection failed)"
        return 1
    fi
}

# Test authenticated endpoint
test_authenticated_endpoint() {
    local url="$1"
    local expected_status="${2:-401}"
    local description="${3:-$url (unauthenticated)}"

    test_endpoint "$url" "$expected_status" 10 "$description"
}

# Test JSON response structure
test_json_endpoint() {
    local url="$1"
    local expected_fields="$2"
    local description="${3:-$url}"

    log_info "Testing JSON structure: $description"

    local response
    if response=$(curl -s --max-time 10 "$url" 2>/dev/null); then
        if echo "$response" | jq . >/dev/null 2>&1; then
            local missing_fields=()
            for field in $expected_fields; do
                if ! echo "$response" | jq -e ".$field" >/dev/null 2>&1; then
                    missing_fields+=("$field")
                fi
            done

            if [[ ${#missing_fields[@]} -eq 0 ]]; then
                log_success "✓ $description (JSON structure valid)"
                return 0
            else
                log_warning "✗ $description (missing fields: ${missing_fields[*]})"
                return 1
            fi
        else
            log_error "✗ $description (invalid JSON response)"
            return 1
        fi
    else
        log_error "✗ $description (request failed)"
        return 1
    fi
}

# Test core health endpoints
test_core_health() {
    log_info "=== Core Health Check ==="

    local tests_passed=0
    local total_tests=0

    # Basic health endpoint
    ((total_tests++))
    if test_endpoint "$BASE_URL/health" 200 5 "Core health endpoint"; then
        ((tests_passed++))
    fi

    # API health with JSON structure
    ((total_tests++))
    if test_json_endpoint "$BASE_URL/api/health" "status uptime version" "API health endpoint"; then
        ((tests_passed++))
    fi

    # ChittyID spec endpoint
    ((total_tests++))
    if test_json_endpoint "$BASE_URL/api/spec" "format version regions trust_levels" "ChittyID specification"; then
        ((tests_passed++))
    fi

    log_info "Core health: $tests_passed/$total_tests tests passed"
    return $((total_tests - tests_passed))
}

# Test pipeline security
test_pipeline_security() {
    log_info "=== Pipeline Security Check ==="

    local tests_passed=0
    local total_tests=0

    # Pipeline endpoints should require authentication
    local pipeline_endpoints=(
        "/api/get-chittyid"
        "/api/get-chittyid?for=person"
        "/api/get-chittyid?for=work-item"
    )

    for endpoint in "${pipeline_endpoints[@]}"; do
        ((total_tests++))
        if test_authenticated_endpoint "$BASE_URL$endpoint" 401 "Pipeline security: $endpoint"; then
            ((tests_passed++))
        fi
    done

    log_info "Pipeline security: $tests_passed/$total_tests tests passed"
    return $((total_tests - tests_passed))
}

# Test public endpoints
test_public_endpoints() {
    log_info "=== Public Endpoints Check ==="

    local tests_passed=0
    local total_tests=0

    # Validation endpoint (should accept POST)
    ((total_tests++))
    if test_endpoint "$BASE_URL/api/validate" 400 10 "Validation endpoint (no body)"; then
        ((tests_passed++))
    fi

    # Search endpoint (should accept POST)
    ((total_tests++))
    if test_endpoint "$BASE_URL/api/search" 400 10 "Search endpoint (no body)"; then
        ((tests_passed++))
    fi

    log_info "Public endpoints: $tests_passed/$total_tests tests passed"
    return $((total_tests - tests_passed))
}

# Test session endpoints
test_session_endpoints() {
    log_info "=== Session Endpoints Check ==="

    local tests_passed=0
    local total_tests=0

    # Session health
    ((total_tests++))
    if test_json_endpoint "$BASE_URL/api/session/health" "status sessions_active" "Session health"; then
        ((tests_passed++))
    fi

    # Session sync (should require auth)
    ((total_tests++))
    if test_authenticated_endpoint "$BASE_URL/api/session/sync" 401 "Session sync (unauthenticated)"; then
        ((tests_passed++))
    fi

    log_info "Session endpoints: $tests_passed/$total_tests tests passed"
    return $((total_tests - tests_passed))
}

# Test bridge endpoints
test_bridge_endpoints() {
    log_info "=== Bridge Endpoints Check ==="

    local tests_passed=0
    local total_tests=0

    # Notion sync status
    ((total_tests++))
    if test_endpoint "$BASE_URL/bridges/notion/status" 200 10 "Notion sync status"; then
        ((tests_passed++))
    fi

    # Notion DLQ status
    ((total_tests++))
    if test_endpoint "$BASE_URL/bridges/notion/dlq:status" 200 10 "Notion DLQ status"; then
        ((tests_passed++))
    fi

    log_info "Bridge endpoints: $tests_passed/$total_tests tests passed"
    return $((total_tests - tests_passed))
}

# Test service registry
test_service_registry() {
    log_info "=== Service Registry Check ==="

    local tests_passed=0
    local total_tests=0

    # Service registry endpoint
    ((total_tests++))
    if test_json_endpoint "$BASE_URL/api/services" "services" "Service registry"; then
        ((tests_passed++))
    fi

    # Service health summary
    ((total_tests++))
    if test_json_endpoint "$BASE_URL/api/services/health" "total healthy unhealthy" "Service health summary"; then
        ((tests_passed++))
    fi

    log_info "Service registry: $tests_passed/$total_tests tests passed"
    return $((total_tests - tests_passed))
}

# Test performance metrics
test_performance() {
    log_info "=== Performance Check ==="

    local start_time=$(date +%s.%N)
    local slow_requests=0
    local total_requests=0

    # Test multiple requests to core endpoint
    for i in {1..5}; do
        ((total_requests++))
        local request_start=$(date +%s.%N)

        if curl -s --max-time 5 "$BASE_URL/api/health" >/dev/null 2>&1; then
            local request_end=$(date +%s.%N)
            local duration=$(echo "$request_end - $request_start" | bc -l)
            local duration_ms=$(printf "%.0f" $(echo "$duration * 1000" | bc -l))

            if (( $(echo "$duration > 2.0" | bc -l) )); then
                ((slow_requests++))
                log_warning "Slow request #$i: ${duration_ms}ms"
            else
                log_info "Request #$i: ${duration_ms}ms"
            fi
        else
            log_error "Request #$i failed"
        fi
    done

    local end_time=$(date +%s.%N)
    local total_duration=$(echo "$end_time - $start_time" | bc -l)
    local avg_duration=$(echo "$total_duration / $total_requests" | bc -l)
    local avg_duration_ms=$(printf "%.0f" $(echo "$avg_duration * 1000" | bc -l))

    log_info "Performance summary: $slow_requests/$total_requests slow requests (>2s)"
    log_info "Average response time: ${avg_duration_ms}ms"

    if [[ $slow_requests -gt 1 ]]; then
        return 1
    else
        return 0
    fi
}

# Generate health report
generate_health_report() {
    local total_failures="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    cat > "health-report-$(date +%Y%m%d-%H%M%S).json" << EOF
{
  "timestamp": "$timestamp",
  "base_url": "$BASE_URL",
  "overall_status": "$([ $total_failures -eq 0 ] && echo "healthy" || echo "degraded")",
  "total_failures": $total_failures,
  "checks": {
    "core_health": "$([ ${core_failures:-0} -eq 0 ] && echo "pass" || echo "fail")",
    "pipeline_security": "$([ ${pipeline_failures:-0} -eq 0 ] && echo "pass" || echo "fail")",
    "public_endpoints": "$([ ${public_failures:-0} -eq 0 ] && echo "pass" || echo "fail")",
    "session_endpoints": "$([ ${session_failures:-0} -eq 0 ] && echo "pass" || echo "fail")",
    "bridge_endpoints": "$([ ${bridge_failures:-0} -eq 0 ] && echo "pass" || echo "fail")",
    "service_registry": "$([ ${registry_failures:-0} -eq 0 ] && echo "pass" || echo "fail")",
    "performance": "$([ ${performance_failures:-0} -eq 0 ] && echo "pass" || echo "fail")"
  },
  "next_check": "$(date -d '+5 minutes' '+%Y-%m-%d %H:%M:%S')"
}
EOF
}

# Main health check function
main() {
    log_info "Starting ChittyID health check..."
    log_info "Base URL: $BASE_URL"
    log_info "Timestamp: $(date)"
    echo

    local total_failures=0

    # Run all health checks
    test_core_health
    local core_failures=$?
    total_failures=$((total_failures + core_failures))

    test_pipeline_security
    local pipeline_failures=$?
    total_failures=$((total_failures + pipeline_failures))

    test_public_endpoints
    local public_failures=$?
    total_failures=$((total_failures + public_failures))

    test_session_endpoints
    local session_failures=$?
    total_failures=$((total_failures + session_failures))

    test_bridge_endpoints
    local bridge_failures=$?
    total_failures=$((total_failures + bridge_failures))

    test_service_registry
    local registry_failures=$?
    total_failures=$((total_failures + registry_failures))

    test_performance
    local performance_failures=$?
    total_failures=$((total_failures + performance_failures))

    echo
    log_info "=== Health Check Summary ==="

    if [[ $total_failures -eq 0 ]]; then
        log_success "🎉 All health checks passed! System is healthy."
    else
        log_warning "⚠️  $total_failures health check(s) failed. System may be degraded."
    fi

    # Generate health report
    generate_health_report "$total_failures"

    log_info "Health check completed. See log: $LOG_FILE"

    exit $total_failures
}

# Handle script arguments
case "${1:-check}" in
    "check")
        main
        ;;
    "core")
        test_core_health
        ;;
    "security")
        test_pipeline_security
        ;;
    "public")
        test_public_endpoints
        ;;
    "sessions")
        test_session_endpoints
        ;;
    "bridges")
        test_bridge_endpoints
        ;;
    "registry")
        test_service_registry
        ;;
    "performance")
        test_performance
        ;;
    "help")
        echo "ChittyID Health Check Script"
        echo
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  check       Run all health checks (default)"
        echo "  core        Check core health endpoints"
        echo "  security    Check pipeline security"
        echo "  public      Check public endpoints"
        echo "  sessions    Check session endpoints"
        echo "  bridges     Check bridge endpoints"
        echo "  registry    Check service registry"
        echo "  performance Check performance metrics"
        echo "  help        Show this help"
        echo
        echo "Environment Variables:"
        echo "  CHITTYID_URL  Base URL for health checks (default: https://id.chitty.cc)"
        echo "  LOG_FILE      Log file path (default: /tmp/chittyid-health.log)"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac