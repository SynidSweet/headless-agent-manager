#!/bin/bash

# Headless AI Agent Manager - Complete System Startup Script
# Starts all three services in separate terminal tabs/windows

set -e

echo "🚀 Starting Headless AI Agent Management System..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if services are already running
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Python proxy already running on port 8000${NC}"
else
    echo "1️⃣  Starting Python Claude Proxy (port 8000)..."
    cd claude-proxy-service
    if [ ! -d "venv" ]; then
        echo -e "${RED}❌ Python venv not found. Run setup first!${NC}"
        exit 1
    fi
    gnome-terminal --tab --title="Python Proxy" -- bash -c "source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000; exec bash" 2>/dev/null || \
    xterm -T "Python Proxy" -e "cd $(pwd) && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000; bash" &
    cd ..
    sleep 2
    echo -e "${GREEN}✅ Python proxy started${NC}"
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Backend already running on port 3000${NC}"
else
    echo "2️⃣  Starting Backend (port 3000)..."
    cd backend
    gnome-terminal --tab --title="Backend" -- bash -c "npm run dev; exec bash" 2>/dev/null || \
    xterm -T "Backend" -e "cd $(pwd) && npm run dev; bash" &
    cd ..
    sleep 3
    echo -e "${GREEN}✅ Backend started${NC}"
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Frontend already running on port 5173${NC}"
else
    echo "3️⃣  Starting Frontend (port 5173)..."
    cd frontend
    gnome-terminal --tab --title="Frontend" -- bash -c "npm run dev; exec bash" 2>/dev/null || \
    xterm -T "Frontend" -e "cd $(pwd) && npm run dev; bash" &
    cd ..
    sleep 3
    echo -e "${GREEN}✅ Frontend started${NC}"
fi

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "📊 Service URLs:"
echo "  - Frontend:      http://localhost:5173"
echo "  - Backend API:   http://localhost:3000"
echo "  - Python Proxy:  http://localhost:8000"
echo ""
echo "💡 To stop all services, run: ./stop-all.sh"
echo ""
