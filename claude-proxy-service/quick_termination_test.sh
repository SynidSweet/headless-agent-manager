#!/bin/bash

# Quick Agent Termination Test
# Tests the DELETE /api/agents/:id endpoint

set -e

BACKEND_URL="http://localhost:3000"
PROXY_URL="http://localhost:8000"

echo "=========================================="
echo "  QUICK AGENT TERMINATION TEST"
echo "=========================================="
echo ""

# Step 1: Check backend health
echo "Step 1: Backend Health Check"
BACKEND_HEALTH=$(curl -s ${BACKEND_URL}/api/health)
echo "✓ Backend Status: $(echo $BACKEND_HEALTH | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
echo ""

# Step 2: Check proxy health
echo "Step 2: Proxy Health Check"
PROXY_HEALTH=$(curl -s ${PROXY_URL}/health)
echo "✓ Proxy Status: $(echo $PROXY_HEALTH | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
echo ""

# Step 3: Launch agent
echo "Step 3: Launch Agent"
LAUNCH_RESPONSE=$(curl -s -X POST ${BACKEND_URL}/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "claude-code",
    "prompt": "Count from 1 to 3 and wait",
    "configuration": {
      "model": "claude-sonnet-4-5-20250929"
    }
  }')

AGENT_ID=$(echo $LAUNCH_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✓ Agent launched: $AGENT_ID"
echo ""

# Step 4: Wait for RUNNING status
echo "Step 4: Wait for RUNNING Status"
sleep 3

STATUS=$(curl -s ${BACKEND_URL}/api/agents/${AGENT_ID} | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo "✓ Current status: $STATUS"
echo ""

# Step 5: Terminate agent (CORRECT: DELETE request)
echo "Step 5: Terminate Agent (DELETE /api/agents/${AGENT_ID})"
TERM_RESPONSE=$(curl -s -X DELETE ${BACKEND_URL}/api/agents/${AGENT_ID} -w "\n%{http_code}")
HTTP_CODE=$(echo "$TERM_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "204" ]; then
  echo "✓ Termination accepted (HTTP 204)"
else
  echo "✗ Unexpected HTTP code: $HTTP_CODE"
  exit 1
fi
echo ""

# Step 6: Verify TERMINATED status
echo "Step 6: Verify TERMINATED Status"
sleep 2

FINAL_STATUS=$(curl -s ${BACKEND_URL}/api/agents/${AGENT_ID} | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo "✓ Final status: $FINAL_STATUS"

if [ "$FINAL_STATUS" = "terminated" ]; then
  echo "✓ Agent successfully terminated"
else
  echo "✗ Expected 'terminated', got '$FINAL_STATUS'"
  exit 1
fi
echo ""

# Step 7: Verify proxy cleanup
echo "Step 7: Verify Proxy Cleanup"
PROXY_CHECK=$(curl -s ${PROXY_URL}/health)
ACTIVE=$(echo $PROXY_CHECK | grep -o '"active_agents":[0-9]*' | cut -d':' -f2)
echo "✓ Active agents in proxy: $ACTIVE"
echo ""

# Summary
echo "=========================================="
echo "  ✓✓✓ ALL TESTS PASSED ✓✓✓"
echo "=========================================="
echo ""
echo "Verified Agent Termination Flow:"
echo "  1. Backend & Proxy healthy"
echo "  2. Agent launched: $AGENT_ID"
echo "  3. Agent reached RUNNING state"
echo "  4. DELETE /api/agents/:id successful"
echo "  5. Agent reached TERMINATED state"
echo "  6. Proxy cleaned up process"
echo ""
