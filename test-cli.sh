#!/bin/bash

# ChittyID CLI Test Script
# Tests the CLI functionality with proper environment setup

echo "🧪 ChittyID CLI Test Suite"
echo "=========================="
echo ""

# Setup environment
export NODE_OPTIONS=""
export CHITTY_API_KEY="test-key-for-validation"
export CHITTY_BASE_URL="https://id.chitty.cc"

# Navigate to CLI directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Working Directory: $(pwd)"
echo ""

# Test TypeScript CLI directly
echo "🔍 Testing ChittyID Validation..."
echo "================================="
npx tsx chitty-cli.ts validate "01-1-ABC-1234-P-25-1-31" 2>/dev/null || true
echo ""

echo "📋 Testing Help Output..."
echo "========================"
npx tsx chitty-cli.ts 2>/dev/null || true
echo ""

echo "✅ Test Complete!"