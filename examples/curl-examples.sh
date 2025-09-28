#!/bin/bash

# ChittyID API Examples using cURL
# Demonstrates all available endpoints with practical examples

# Configuration
BASE_URL="${CHITTYID_URL:-https://id.chitty.cc}"
EXAMPLE_ID="03-1-USA-0001-P-251-3-15"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Example 1: Basic Health Check
health_check() {
    log_info "Basic health check"
    echo "curl $BASE_URL/health"
    curl -s "$BASE_URL/health" | jq .
    echo
}

# Example 2: Detailed API Health
api_health() {
    log_info "Detailed API health check"
    echo "curl $BASE_URL/api/health"
    curl -s "$BASE_URL/api/health" | jq .
    echo
}

# Example 3: ChittyID Validation
validate_id() {
    log_info "Validating ChittyID: $EXAMPLE_ID"
    echo "curl -X POST $BASE_URL/api/validate -H 'Content-Type: application/json' -d '{\"id\":\"$EXAMPLE_ID\"}'"
    curl -s -X POST "$BASE_URL/api/validate" \
        -H 'Content-Type: application/json' \
        -d "{\"id\":\"$EXAMPLE_ID\"}" | jq .
    echo
}

# Example 4: Get ChittyID Information
get_info() {
    log_info "Getting information for ChittyID: $EXAMPLE_ID"
    echo "curl $BASE_URL/api/info/$EXAMPLE_ID"
    curl -s "$BASE_URL/api/info/$EXAMPLE_ID" | jq .
    echo
}

# Example 5: Get Format Specification
get_spec() {
    log_info "Getting ChittyID format specification"
    echo "curl $BASE_URL/api/spec"
    curl -s "$BASE_URL/api/spec" | jq .
    echo
}

# Example 6: Service Registry Health
service_health() {
    log_info "Checking service registry health"
    echo "curl $BASE_URL/api/services/health"
    curl -s "$BASE_URL/api/services/health" | jq .
    echo
}

# Example 7: List All Services
list_services() {
    log_info "Listing all ChittyOS services"
    echo "curl $BASE_URL/api/services"
    curl -s "$BASE_URL/api/services" | jq .
    echo
}

# Example 8: Session Sync Health
session_health() {
    log_info "Checking session synchronization health"
    echo "curl $BASE_URL/api/session/health"
    curl -s "$BASE_URL/api/session/health" | jq .
    echo
}

# Example 9: Notion Bridge Status
notion_status() {
    log_info "Checking Notion bridge status"
    echo "curl $BASE_URL/bridges/notion/status"
    curl -s "$BASE_URL/bridges/notion/status" | jq .
    echo
}

# Example 10: Notion DLQ Status
notion_dlq() {
    log_info "Checking Notion DLQ status"
    echo "curl $BASE_URL/bridges/notion/dlq:status"
    curl -s "$BASE_URL/bridges/notion/dlq:status" | jq .
    echo
}

# Example 11: Attempt ChittyID Generation (should fail without auth)
attempt_generation() {
    log_info "Attempting ChittyID generation (should return 401)"
    echo "curl $BASE_URL/api/get-chittyid?for=person"
    echo "Expected: 401 Unauthorized"
    curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/api/get-chittyid?for=person" | jq .
    echo
}

# Example 12: Search ChittyIDs (will return 400 without body)
search_ids() {
    log_info "Searching ChittyIDs (should return 400 without body)"
    echo "curl -X POST $BASE_URL/api/search"
    echo "Expected: 400 Bad Request"
    curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$BASE_URL/api/search" | jq .
    echo
}

# Example 13: Test CORS Headers
test_cors() {
    log_info "Testing CORS preflight request"
    echo "curl -X OPTIONS $BASE_URL/api/health -H 'Origin: https://example.com'"
    curl -s -X OPTIONS "$BASE_URL/api/health" \
        -H 'Origin: https://example.com' \
        -H 'Access-Control-Request-Method: GET' \
        -H 'Access-Control-Request-Headers: Content-Type' \
        -I
    echo
}

# Example 14: Performance Test
performance_test() {
    log_info "Performance test - 5 requests to health endpoint"
    echo "Testing response times..."

    for i in {1..5}; do
        echo -n "Request $i: "
        curl -s -w "%{time_total}s\n" -o /dev/null "$BASE_URL/api/health"
    done
    echo
}

# Example 15: Test Different Entity Types (validation)
test_entity_types() {
    log_info "Testing different entity types"

    local entity_examples=(
        "03-1-USA-0001-P-251-3-15:Person"
        "03-2-CAN-0002-L-251-4-67:Location"
        "03-3-GBR-0003-T-251-2-89:Thing"
        "03-4-DEU-0004-E-251-5-12:Event"
    )

    for example in "${entity_examples[@]}"; do
        local id="${example%:*}"
        local type="${example#*:}"

        echo "Validating $type: $id"
        curl -s -X POST "$BASE_URL/api/validate" \
            -H 'Content-Type: application/json' \
            -d "{\"id\":\"$id\"}" | jq -r '.metadata.entityTypeName // "Invalid"'
    done
    echo
}

# Example 16: Test Error Handling
test_errors() {
    log_info "Testing error handling"

    echo "1. Invalid ChittyID format:"
    curl -s -X POST "$BASE_URL/api/validate" \
        -H 'Content-Type: application/json' \
        -d '{"id":"invalid-format"}' | jq -r '.error // "No error"'

    echo "2. Malformed JSON:"
    curl -s -X POST "$BASE_URL/api/validate" \
        -H 'Content-Type: application/json' \
        -d '{invalid json}' | jq -r '.error // "No error"' 2>/dev/null || echo "Request failed as expected"

    echo "3. Missing content-type:"
    curl -s -X POST "$BASE_URL/api/validate" \
        -d '{"id":"test"}' | jq -r '.error // "No error"' 2>/dev/null || echo "Request failed as expected"

    echo
}

# Example 17: Monitoring Script
monitoring_script() {
    log_info "Monitoring script - checking all endpoints"

    local endpoints=(
        "/health"
        "/api/health"
        "/api/services/health"
        "/api/session/health"
        "/bridges/notion/status"
    )

    echo "Endpoint Status Report:"
    echo "======================="

    for endpoint in "${endpoints[@]}"; do
        local status_code
        status_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint")

        if [[ "$status_code" == "200" ]]; then
            echo "✅ $endpoint - OK ($status_code)"
        else
            echo "❌ $endpoint - FAIL ($status_code)"
        fi
    done
    echo
}

# Example 18: Load Test Simulation
load_test() {
    log_info "Load test simulation - concurrent requests"
    echo "Running 10 concurrent health checks..."

    for i in {1..10}; do
        (
            response_time=$(curl -s -w "%{time_total}" -o /dev/null "$BASE_URL/api/health")
            echo "Request $i: ${response_time}s"
        ) &
    done

    wait
    echo "Load test completed"
    echo
}

# Help function
show_help() {
    echo "ChittyID API Examples using cURL"
    echo
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  all               Run all examples"
    echo "  health            Basic health check"
    echo "  api-health        Detailed API health"
    echo "  validate          Validate a ChittyID"
    echo "  info              Get ChittyID information"
    echo "  spec              Get format specification"
    echo "  services          Service registry health"
    echo "  list-services     List all services"
    echo "  sessions          Session sync health"
    echo "  notion            Notion bridge status"
    echo "  notion-dlq        Notion DLQ status"
    echo "  generate          Attempt generation (will fail)"
    echo "  search            Search endpoint test"
    echo "  cors              Test CORS headers"
    echo "  performance       Performance test"
    echo "  entity-types      Test different entity types"
    echo "  errors            Test error handling"
    echo "  monitor           Monitoring script"
    echo "  load-test         Load test simulation"
    echo "  help              Show this help"
    echo
    echo "Environment Variables:"
    echo "  CHITTYID_URL      Base URL (default: https://id.chitty.cc)"
    echo
    echo "Examples:"
    echo "  $0 health"
    echo "  $0 validate"
    echo "  CHITTYID_URL=http://localhost:8787 $0 all"
}

# Main function
main() {
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found. Install it for better JSON formatting: brew install jq"
        echo
    fi

    if ! command -v curl &> /dev/null; then
        log_error "curl not found. Please install curl."
        exit 1
    fi

    log_info "ChittyID API Examples"
    log_info "Base URL: $BASE_URL"
    echo

    case "${1:-all}" in
        "all")
            health_check
            api_health
            validate_id
            get_info
            get_spec
            service_health
            session_health
            notion_status
            attempt_generation
            test_entity_types
            monitoring_script
            ;;
        "health")
            health_check
            ;;
        "api-health")
            api_health
            ;;
        "validate")
            validate_id
            ;;
        "info")
            get_info
            ;;
        "spec")
            get_spec
            ;;
        "services")
            service_health
            ;;
        "list-services")
            list_services
            ;;
        "sessions")
            session_health
            ;;
        "notion")
            notion_status
            ;;
        "notion-dlq")
            notion_dlq
            ;;
        "generate")
            attempt_generation
            ;;
        "search")
            search_ids
            ;;
        "cors")
            test_cors
            ;;
        "performance")
            performance_test
            ;;
        "entity-types")
            test_entity_types
            ;;
        "errors")
            test_errors
            ;;
        "monitor")
            monitoring_script
            ;;
        "load-test")
            load_test
            ;;
        "help")
            show_help
            ;;
        *)
            log_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"