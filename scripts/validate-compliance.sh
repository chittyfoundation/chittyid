#!/bin/bash

# ChittyID Compliance Validation Script
# Ensures NO LOCAL GENERATION exists anywhere in the codebase
# All ChittyIDs must be requested from https://id.chitty.cc

set -e

BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${BLUE}   ChittyID Compliance Validation Script${RESET}"
echo -e "${BOLD}${BLUE}   Enforcing Server-Only Generation${RESET}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════${RESET}\n"

VIOLATIONS=0
WARNINGS=0
FIXED=0

# Function to check file for violations
check_file() {
    local file=$1
    local violations_found=0

    # Skip node_modules and build directories
    if [[ "$file" == *"node_modules"* ]] || [[ "$file" == *"dist/"* ]] || [[ "$file" == *".git/"* ]]; then
        return 0
    fi

    # Check for local generation patterns
    if grep -q "generateChittyID\|generateSequence\|generateComponent\|calculateChecksum" "$file" 2>/dev/null; then
        # Check if it's a server request (allowed)
        if ! grep -q "fetch\|https://id.chitty.cc\|server\|request" "$file" 2>/dev/null; then
            echo -e "${RED}❌ VIOLATION${RESET}: Local generation pattern found in $file"
            ((VIOLATIONS++))
            violations_found=1
        fi
    fi

    # Check for fallback generation
    if grep -q "fallback.*generate\|generateFallback\|CHITTY_FALLBACK" "$file" 2>/dev/null; then
        echo -e "${RED}❌ VIOLATION${RESET}: Fallback generation found in $file"
        ((VIOLATIONS++))
        violations_found=1
    fi

    # Check for local ID construction
    if grep -q "crypto\.randomBytes.*chitty\|Math\.random.*chitty" "$file" 2>/dev/null; then
        echo -e "${RED}❌ VIOLATION${RESET}: Local ID construction found in $file"
        ((VIOLATIONS++))
        violations_found=1
    fi

    # Check for offline mode
    if grep -q "offline.*chittyid\|chittyid.*offline\|local.*mode.*chitty" "$file" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  WARNING${RESET}: Offline mode reference found in $file"
        ((WARNINGS++))
    fi

    return $violations_found
}

# Function to validate directory
validate_directory() {
    local dir=$1
    echo -e "\n${BOLD}Validating: $dir${RESET}"

    if [ ! -d "$dir" ]; then
        echo -e "${YELLOW}  Directory not found, skipping${RESET}"
        return
    fi

    local dir_violations=0

    # Find all JavaScript and TypeScript files
    while IFS= read -r file; do
        if check_file "$file"; then
            ((dir_violations++))
        fi
    done < <(find "$dir" -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \) 2>/dev/null)

    if [ $dir_violations -eq 0 ]; then
        echo -e "${GREEN}  ✓ Directory compliant${RESET}"
    else
        echo -e "${RED}  ✗ $dir_violations files with violations${RESET}"
    fi
}

# Main validation
echo -e "${BOLD}Starting compliance validation...${RESET}\n"

# Check main repository
validate_directory "/Users/nb/.claude/projects/-/CHITTYFOUNDATION/chittyid"

# Check tools directories
validate_directory "/Users/nb/.claude/tools/chittyid"
validate_directory "/Users/nb/.claude/tools/chittyid-server"
validate_directory "/Users/nb/.claude/tools/replit"

# Check connectors
validate_directory "/Users/nb/.claude/connectors"

# Check for documentation issues
echo -e "\n${BOLD}Checking documentation...${RESET}"

# Find README and MD files with outdated information
for file in $(find /Users/nb/.claude -name "*.md" -type f 2>/dev/null | grep -E "chitty|ChittyID" | head -20); do
    if [[ "$file" == *"node_modules"* ]]; then
        continue
    fi

    if grep -q "local generation\|offline mode\|fallback generation" "$file" 2>/dev/null; then
        if ! grep -q "NO LOCAL GENERATION\|NEVER.*local\|prohibited\|not allowed" "$file" 2>/dev/null; then
            echo -e "${YELLOW}⚠️  WARNING${RESET}: Documentation may need update: $file"
            ((WARNINGS++))
        fi
    fi
done

# Check for test files that might mock generation
echo -e "\n${BOLD}Checking test files...${RESET}"

for file in $(find /Users/nb/.claude -name "*test*.js" -o -name "*test*.ts" -o -name "*spec*.js" 2>/dev/null | head -20); do
    if [[ "$file" == *"node_modules"* ]]; then
        continue
    fi

    if grep -q "mock.*chittyid\|stub.*chittyid\|fake.*chittyid" "$file" 2>/dev/null; then
        echo -e "${BLUE}ℹ️  INFO${RESET}: Test file with mocks: $file"
        echo "    Ensure tests use real server or proper error handling"
    fi
done

# Summary
echo -e "\n${BOLD}${BLUE}═══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}Compliance Validation Summary${RESET}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════${RESET}\n"

if [ $VIOLATIONS -eq 0 ]; then
    echo -e "${GREEN}✅ NO VIOLATIONS FOUND${RESET}"
    echo -e "${GREEN}All ChittyID implementations comply with server-only policy${RESET}"
else
    echo -e "${RED}❌ VIOLATIONS FOUND: $VIOLATIONS${RESET}"
    echo -e "${RED}These files contain local generation and must be fixed${RESET}"
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  WARNINGS: $WARNINGS${RESET}"
    echo -e "${YELLOW}Review these files for potential issues${RESET}"
fi

# Enforcement checks
echo -e "\n${BOLD}Enforcement Status:${RESET}"

# Check if hybrid system is running
if curl -s http://localhost:8787/health 2>/dev/null | grep -q "STRICT_SERVER_ONLY"; then
    echo -e "${GREEN}✓ Hybrid system enforcing server-only generation${RESET}"
else
    echo -e "${YELLOW}⚠️  Hybrid system not running or not accessible${RESET}"
fi

# Check main server
if curl -s https://id.chitty.cc/health 2>/dev/null | grep -q "online"; then
    echo -e "${GREEN}✓ Main ChittyID server online${RESET}"
else
    echo -e "${YELLOW}⚠️  Cannot reach main ChittyID server${RESET}"
fi

echo -e "\n${BOLD}Recommendations:${RESET}"
echo "1. Fix all violations immediately"
echo "2. Update documentation to reflect server-only policy"
echo "3. Configure CHITTY_API_KEY in all environments"
echo "4. Deploy hybrid system to production"
echo "5. Monitor server availability continuously"

# Exit with error if violations found
if [ $VIOLATIONS -gt 0 ]; then
    echo -e "\n${RED}${BOLD}Compliance validation FAILED${RESET}"
    exit 1
else
    echo -e "\n${GREEN}${BOLD}Compliance validation PASSED${RESET}"
    exit 0
fi