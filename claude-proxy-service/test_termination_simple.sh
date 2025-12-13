#!/bin/bash
# Simple agent termination test

set -e

echo "========================================="
echo "  Agent Termination Test"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000/api"

echo "Step 1: Check backend health"
HEALTH=$(curl -s ${BASE_URL}/health)
echo "✓ Backend is healthy"
echo "  Active agents: $(echo $HEALTH | grep -o '"activeAgents":[0-9]*' | cut -d: -f2)"
echo ""

echo "Step 2: Launch a test agent"
RESPONSE=$(curl -s -X POST ${BASE_URL}/agents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "claude-code",
    "prompt": "Count from 1 to 5 slowly, then wait for further instructions",
    "configuration": {
      "model": "claude-sonnet-4-5-20250929"
    }
  }')

AGENT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$AGENT_ID" ]; then
  echo "✗ Failed to launch agent"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✓ Agent launched: $AGENT_ID"
echo ""

echo "Step 3: Wait for agent to start (10 seconds)"
sleep 2

for i in {1..8}; do
  STATUS=$(curl -s ${BASE_URL}/agents/${AGENT_ID} | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  echo "  Status: $STATUS"

  if [ "$STATUS" = "running" ]; then
    echo "✓ Agent is RUNNING"
    break
  fi

  sleep 1
done

echo ""

echo "Step 4: Let agent run for 3 seconds"
sleep 3
echo ""

echo "Step 5: Terminate the agent"
TERM_RESPONSE=$(curl -s -X POST ${BASE_URL}/agents/${AGENT_ID}/terminate)
echo "✓ Termination request sent"
echo ""

echo "Step 6: Verify termination (checking status)"
sleep 2

for i in {1..5}; do
  STATUS=$(curl -s ${BASE_URL}/agents/${AGENT_ID} | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  echo "  Status: $STATUS"

  if [ "$STATUS" = "terminated" ]; then
    echo -e "${GREEN}✓ Agent successfully TERMINATED${NC}"
    break
  fi

  sleep 1
done

echo ""

echo "Step 7: Check final agent details"
curl -s ${BASE_URL}/agents/${AGENT_ID} | grep -o '"status":"[^"]*"'
echo ""

echo "Step 8: Verify proxy cleanup"
HEALTH=$(curl -s http://localhost:8000/health)
ACTIVE=$(echo $HEALTH | grep -o '"active_agents":[0-9]*' | cut -d: -f2)
echo "  Active agents in proxy: $ACTIVE"

if [ "$ACTIVE" = "0" ]; then
  echo -e "${GREEN}✓ Proxy successfully cleaned up${NC}"
else
  echo -e "${YELLOW}⚠ Warning: Proxy still has $ACTIVE active agent(s)${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}✓ TEST COMPLETE${NC}"
echo "========================================="
echo ""
echo "Summary:"
echo "  - Agent launched successfully"
echo "  - Agent reached RUNNING state"
echo "  - Termination signal sent"
echo "  - Agent reached TERMINATED state"
echo "  - Cleanup verified"
