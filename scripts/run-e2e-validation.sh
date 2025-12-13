#!/bin/bash
# E2E Test Validation Script
# Runs complete E2E test validation after fixes

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          E2E Test Validation                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Verify backend is not running
echo "📋 Step 1: Checking for running backend instances..."
if lsof -i :3001 > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Backend already running on port 3001${NC}"
  echo "   Killing existing instance..."
  kill $(lsof -ti :3001) 2>/dev/null || true
  sleep 2
fi

if lsof -i :3001 > /dev/null 2>&1; then
  echo -e "${RED}❌ Failed to kill backend on port 3001${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Port 3001 is free${NC}"
echo ""

# Step 2: Clean up database
echo "📋 Step 2: Cleaning up database..."
rm -f backend/data/agents.db backend/data/agents.db-shm backend/data/agents.db-wal
echo -e "${GREEN}✅ Database cleaned${NC}"
echo ""

# Step 3: Start backend in background
echo "📋 Step 3: Starting backend..."
cd backend

# Kill any existing background processes
pkill -f "npm run dev" 2>/dev/null || true
sleep 1

# Start backend
npm run dev > /tmp/e2e-backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "   Waiting for backend to start..."
for i in {1..30}; do
  if curl -s http://localhost:3001/api/agents > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is ready${NC}"
    break
  fi

  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ Backend failed to start within 30 seconds${NC}"
    echo "   Logs:"
    tail -20 /tmp/e2e-backend.log
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
  fi

  sleep 1
done
echo ""

# Step 4: Run E2E tests
echo "📋 Step 4: Running E2E tests..."
cd ../frontend

npm run test:e2e 2>&1 | tee /tmp/e2e-test-results.log
TEST_EXIT_CODE=${PIPESTATUS[0]}

echo ""

# Step 5: Stop backend
echo "📋 Step 5: Stopping backend..."
kill $BACKEND_PID 2>/dev/null || true
sleep 2

if lsof -i :3001 > /dev/null 2>&1; then
  kill -9 $(lsof -ti :3001) 2>/dev/null || true
fi

echo -e "${GREEN}✅ Backend stopped${NC}"
echo ""

# Step 6: Report results
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          Test Results                                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ All E2E tests passed!${NC}"
  echo ""
  echo "Backend logs: /tmp/e2e-backend.log"
  echo "Test results: /tmp/e2e-test-results.log"
  exit 0
else
  echo -e "${RED}❌ E2E tests failed${NC}"
  echo ""
  echo "Backend logs: /tmp/e2e-backend.log"
  echo "Test results: /tmp/e2e-test-results.log"
  echo ""
  echo "Common issues:"
  echo "  1. Database not clean - check cleanup helper"
  echo "  2. Backend not responding - check backend logs"
  echo "  3. Force delete not working - check AgentController"
  exit 1
fi
