#!/bin/bash
set -euo pipefail
echo "=== chittyid Onboarding ==="
curl -s -X POST "${GETCHITTY_ENDPOINT:-https://get.chitty.cc/api/onboard}" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"chittyid","organization":"CHITTYFOUNDATION","type":"foundation","tier":0,"domains":["id.chitty.cc"]}' | jq .
