#!/bin/bash

echo "🔒 COMPREHENSIVE SECURITY TEST BATTERY"
echo "======================================"
echo ""

ENDPOINT="https://chittyid-mothership.chitty.workers.dev"

# Test 1: Legacy Endpoints
echo "1️⃣  Testing Legacy Endpoint Blocking..."
echo "----------------------------------------"
for path in "/api/generate" "/api/create" "/api/mint" "/api/issue" "/direct/generate" "/bypass/auth"; do
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$ENDPOINT$path")
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    echo "  $path → HTTP $http_code"
done
echo ""

# Test 2: Bypass Headers
echo "2️⃣  Testing Bypass Header Detection..."
echo "---------------------------------------"
headers=(
    "X-Bypass-Pipeline: true"
    "X-Skip-Auth: yes"
    "X-Admin-Override: enabled"
    "X-Direct-Access: allow"
    "X-Emergency-Generate: true"
    "X-Force-Generate: yes"
)

for header in "${headers[@]}"; do
    header_name=$(echo "$header" | cut -d: -f1)
    response=$(curl -s -H "$header" "$ENDPOINT/api/get-chittyid")
    reason=$(echo "$response" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
    if [ "$reason" = "BYPASS_ATTEMPT_DETECTED" ]; then
        echo "  ✅ $header_name → BLOCKED"
    else
        echo "  ❌ $header_name → NOT BLOCKED ($reason)"
    fi
done
echo ""

# Test 3: Query Parameter Bypass
echo "3️⃣  Testing Query Parameter Bypass..."
echo "-------------------------------------"
params=("bypass=true" "skip-pipeline=yes" "override=admin" "direct=true")

for param in "${params[@]}"; do
    response=$(curl -s "$ENDPOINT/api/get-chittyid?$param")
    reason=$(echo "$response" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
    if [ "$reason" = "SUSPICIOUS_PATTERN_DETECTED" ]; then
        echo "  ✅ ?$param → BLOCKED"
    else
        echo "  ❌ ?$param → NOT BLOCKED ($reason)"
    fi
done
echo ""

# Test 4: Pipeline Requirements
echo "4️⃣  Testing Pipeline Requirements..."
echo "------------------------------------"
# Test without auth header
response=$(curl -s "$ENDPOINT/api/get-chittyid")
reason=$(echo "$response" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
echo "  No Auth Header → $reason"

# Test with auth but no session
response=$(curl -s -H "Authorization: Bearer fake-token" "$ENDPOINT/api/get-chittyid")
reason=$(echo "$response" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
echo "  Auth but no Session → $reason"
echo ""

# Test 5: Valid API Endpoints
echo "5️⃣  Testing Valid API Endpoints..."
echo "----------------------------------"
# Health check
health=$(curl -s "$ENDPOINT/api/health")
status=$(echo "$health" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo "  /api/health → Status: $status"

# Validation endpoint
validation=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"id":"03-1-USA-0001-P-241-3-82"}' \
    "$ENDPOINT/api/validate")
valid=$(echo "$validation" | grep -o '"valid":[^,}]*' | cut -d: -f2)
echo "  /api/validate → Valid: $valid"

# Spec endpoint
spec=$(curl -s "$ENDPOINT/api/spec")
if echo "$spec" | grep -q "specification"; then
    echo "  /api/spec → ✅ Returns specification"
else
    echo "  /api/spec → ❌ No specification"
fi
echo ""

# Test 6: HTTP Methods
echo "6️⃣  Testing HTTP Method Enforcement..."
echo "--------------------------------------"
methods=("GET" "POST" "PUT" "DELETE" "PATCH" "OPTIONS")
for method in "${methods[@]}"; do
    response=$(curl -s -X "$method" -w "\nHTTP_CODE:%{http_code}" "$ENDPOINT/api/generate" 2>/dev/null)
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    if [ "$http_code" = "410" ] || [ "$http_code" = "403" ]; then
        echo "  $method /api/generate → ✅ BLOCKED ($http_code)"
    else
        echo "  $method /api/generate → Status $http_code"
    fi
done
echo ""

# Test 7: Generate URL patterns
echo "7️⃣  Testing Generate Pattern Detection..."
echo "-----------------------------------------"
urls=(
    "/api/user/generate-id"
    "/some/path/generate"
    "/api/quick-generate"
    "/generate-chittyid"
)

for url in "${urls[@]}"; do
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$ENDPOINT$url")
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    if [ "$http_code" = "403" ] || [ "$http_code" = "410" ]; then
        echo "  $url → ✅ BLOCKED ($http_code)"
    else
        echo "  $url → Status $http_code"
    fi
done
echo ""

echo "======================================"
echo "🎯 SECURITY TEST BATTERY COMPLETE"
echo "======================================"