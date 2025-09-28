#!/bin/bash

echo "🔐 ADVANCED SECURITY TESTING"
echo "============================"
echo ""

ENDPOINT="https://chittyid-mothership.chitty.workers.dev"

# Test Rate Limiting
echo "⚡ Testing Rate Limiting..."
echo "--------------------------"
echo "Sending 15 rapid requests to /api/get-chittyid..."

for i in {1..15}; do
    response=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT/api/get-chittyid")
    if [ "$response" = "429" ]; then
        echo "  Request $i: ✅ Rate limited (429)"
    else
        echo -n "  Request $i: $response"
        if [ $i -lt 11 ]; then
            echo " (within limit)"
        else
            echo " (should be rate limited)"
        fi
    fi
done
echo ""

# Test JSON Body Bypass Attempts
echo "📦 Testing JSON Body Bypass..."
echo "-----------------------------"
payloads=(
    '{"bypassPipeline": true}'
    '{"skipAuth": true}'
    '{"action": "generate"}'
    '{"directGenerate": true}'
    '{"forceCreate": true}'
)

for payload in "${payloads[@]}"; do
    response=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "$payload" "$ENDPOINT/api/get-chittyid")
    reason=$(echo "$response" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
    if echo "$response" | grep -q "GENERATION_IN_BODY_BLOCKED\|BYPASS_ATTEMPT_DETECTED\|SUSPICIOUS_PATTERN_DETECTED"; then
        echo "  ✅ $payload → BLOCKED"
    else
        echo "  ❌ $payload → $reason"
    fi
done
echo ""

# Test Path Traversal
echo "🗂️ Testing Path Traversal..."
echo "----------------------------"
paths=(
    "/../../../etc/passwd"
    "/api/../generate"
    "/api/../../admin"
    "/api/get-chittyid/../../../secret"
)

for path in "${paths[@]}"; do
    response=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT$path")
    echo "  $path → HTTP $response"
done
echo ""

# Test Unicode/Encoded Bypass
echo "🔤 Testing Unicode/Encoded Bypass..."
echo "-----------------------------------"
# URL encoded "generate"
encoded_generate="%67%65%6e%65%72%61%74%65"
response=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT/api/$encoded_generate")
echo "  URL encoded 'generate' → HTTP $response"

# Test with Unicode bypass attempt
response=$(curl -s -H "X-Bүpass-Pipeline: true" "$ENDPOINT/api/get-chittyid")
if echo "$response" | grep -q "BYPASS_ATTEMPT_DETECTED"; then
    echo "  Unicode header bypass → ✅ BLOCKED"
else
    echo "  Unicode header bypass → NOT BLOCKED"
fi
echo ""

# Test SQL Injection Attempts
echo "💉 Testing SQL Injection Prevention..."
echo "-------------------------------------"
injections=(
    "'; DROP TABLE users--"
    "1' OR '1'='1"
    "admin'--"
)

for injection in "${injections[@]}"; do
    response=$(curl -s "$ENDPOINT/api/info/$injection")
    if echo "$response" | grep -q "error\|invalid"; then
        echo "  ✅ '$injection' → Safely handled"
    else
        echo "  ⚠️  '$injection' → Check handling"
    fi
done
echo ""

# Test Large Payload Attack
echo "💣 Testing Large Payload Handling..."
echo "-----------------------------------"
# Create 1MB payload
large_payload=$(printf 'A%.0s' {1..1000000})
response=$(curl -s -X POST -H "Content-Type: text/plain" \
    -d "$large_payload" "$ENDPOINT/api/validate" \
    -w "\nHTTP_CODE:%{http_code}" 2>/dev/null | grep "HTTP_CODE:" | cut -d: -f2)
echo "  1MB payload → HTTP $response"
echo ""

# Test Concurrent Requests
echo "🔀 Testing Concurrent Request Handling..."
echo "----------------------------------------"
echo "Sending 5 concurrent requests..."

for i in {1..5}; do
    curl -s -o /dev/null -w "Request $i: %{http_code}\n" "$ENDPOINT/api/health" &
done
wait
echo ""

# Test Error Recovery
echo "🔧 Testing Error Recovery..."
echo "---------------------------"
# Send malformed JSON
response=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"id": malformed json}' "$ENDPOINT/api/validate")
if echo "$response" | grep -q "error"; then
    echo "  Malformed JSON → ✅ Error handled gracefully"
else
    echo "  Malformed JSON → ⚠️  Check error handling"
fi

# Test with missing content type
response=$(curl -s -X POST -d '{"id":"test"}' "$ENDPOINT/api/validate")
if echo "$response" | grep -q "success"; then
    echo "  Missing Content-Type → ✅ Handled"
else
    echo "  Missing Content-Type → ⚠️  Not handled"
fi
echo ""

echo "============================"
echo "🏁 ADVANCED TESTING COMPLETE"
echo "============================"