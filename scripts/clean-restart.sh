#!/bin/bash
#
# Clean Restart Script
# Kills all backend/proxy processes and restarts with fresh state
#
# Usage:
#   ./scripts/clean-restart.sh           # Restart both backend and proxy
#   ./scripts/clean-restart.sh --backend-only   # Restart only backend
#   ./scripts/clean-restart.sh --proxy-only     # Restart only proxy
#   ./scripts/clean-restart.sh --kill-only      # Just kill, don't restart
#

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
PROXY_DIR="$PROJECT_ROOT/claude-proxy-service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
BACKEND_ONLY=false
PROXY_ONLY=false
KILL_ONLY=false

for arg in "$@"; do
  case $arg in
    --backend-only) BACKEND_ONLY=true ;;
    --proxy-only) PROXY_ONLY=true ;;
    --kill-only) KILL_ONLY=true ;;
  esac
done

echo -e "${YELLOW}🧹 Cleaning up processes...${NC}"

# Kill all backend processes
if [ "$PROXY_ONLY" != true ]; then
  echo "  Killing backend processes (ts-node-dev, node on port 3000)..."
  pkill -9 -f "ts-node-dev.*backend" 2>/dev/null || true
  pkill -9 -f "node.*backend.*main" 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 2

  if lsof -ti:3000 > /dev/null 2>&1; then
    echo -e "${RED}  ✗ Port 3000 still in use!${NC}"
    lsof -ti:3000 | xargs ps -p 2>/dev/null || true
    exit 1
  else
    echo -e "${GREEN}  ✓ Backend processes killed${NC}"
  fi
fi

# Kill all proxy processes
if [ "$BACKEND_ONLY" != true ]; then
  echo "  Killing proxy processes (uvicorn on port 8000)..."
  pkill -9 -f "uvicorn.*claude-proxy" 2>/dev/null || true
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  sleep 2

  if lsof -ti:8000 > /dev/null 2>&1; then
    echo -e "${RED}  ✗ Port 8000 still in use!${NC}"
    lsof -ti:8000 | xargs ps -p 2>/dev/null || true
    exit 1
  else
    echo -e "${GREEN}  ✓ Proxy processes killed${NC}"
  fi
fi

# Exit if kill-only mode
if [ "$KILL_ONLY" = true ]; then
  echo -e "${GREEN}✓ Cleanup complete (kill-only mode)${NC}"
  exit 0
fi

# Clean database
if [ "$PROXY_ONLY" != true ]; then
  echo -e "${YELLOW}🗑️  Cleaning database...${NC}"
  rm -rf "$BACKEND_DIR/data"/*
  mkdir -p "$BACKEND_DIR/data"
  echo -e "${GREEN}  ✓ Database cleared${NC}"
fi

# Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"

# Start Python proxy
if [ "$BACKEND_ONLY" != true ]; then
  echo "  Starting Python proxy (port 8000)..."
  cd "$PROXY_DIR"

  if [ ! -d "venv" ]; then
    echo -e "${RED}  ✗ Virtual environment not found${NC}"
    echo "    Run: cd claude-proxy-service && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
  fi

  source venv/bin/activate
  nohup uvicorn app.main:app --reload > /tmp/claude-proxy.log 2>&1 &
  PROXY_PID=$!

  # Wait for proxy to start
  for i in {1..10}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
      echo -e "${GREEN}  ✓ Python proxy started (PID: $PROXY_PID)${NC}"
      break
    fi
    if [ $i -eq 10 ]; then
      echo -e "${RED}  ✗ Python proxy failed to start${NC}"
      cat /tmp/claude-proxy.log | tail -20
      exit 1
    fi
    sleep 1
  done
fi

# Start backend
if [ "$PROXY_ONLY" != true ]; then
  echo "  Starting backend (port 3000)..."
  cd "$BACKEND_DIR"

  nohup npm run dev > /tmp/backend.log 2>&1 &
  BACKEND_PID=$!

  # Wait for backend to start
  for i in {1..15}; do
    if curl -s http://localhost:3000/api/agents > /dev/null 2>&1; then
      echo -e "${GREEN}  ✓ Backend started (PID: $BACKEND_PID)${NC}"
      break
    fi
    if [ $i -eq 15 ]; then
      echo -e "${RED}  ✗ Backend failed to start${NC}"
      cat /tmp/backend.log | tail -30
      exit 1
    fi
    sleep 1
  done
fi

echo ""
echo -e "${GREEN}✅ All services running!${NC}"
echo ""
echo "Service status:"
if [ "$PROXY_ONLY" != true ]; then
  echo -e "  Backend:      ${GREEN}http://localhost:3000${NC}"
  echo "    Logs:       tail -f /tmp/backend.log"
fi
if [ "$BACKEND_ONLY" != true ]; then
  echo -e "  Python Proxy: ${GREEN}http://localhost:8000${NC}"
  echo "    Logs:       tail -f /tmp/claude-proxy.log"
fi
echo ""
echo "To stop services:"
echo "  $0 --kill-only"
