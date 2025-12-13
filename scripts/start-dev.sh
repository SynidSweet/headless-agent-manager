#!/bin/bash
# Start Development Environment
# Runs on alternate ports: Backend 3001, Frontend 5174
# This allows prod (3000/5173) and dev to run simultaneously

set -e

echo "🚀 Starting Development Environment"
echo ""

# Kill any existing dev instances
echo "Cleaning up existing processes..."
lsof -ti:3001 | xargs -r kill -9 2>/dev/null || true
lsof -ti:5174 | xargs -r kill -9 2>/dev/null || true
rm -f backend/data/backend.pid
sleep 2

# Start backend on port 3001 with NODE_ENV=development
echo "Starting backend on port 3001..."
cd backend
NODE_ENV=development PORT=3001 nohup npm run dev > /tmp/backend-dev.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"
cd ..

sleep 5

# Start frontend on port 5174
echo "Starting frontend on port 5174..."
cd frontend
VITE_PORT=5174 VITE_API_URL=http://localhost:3001 VITE_WS_URL=http://localhost:3001 nohup npm run dev > /tmp/frontend-dev.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"
cd ..

sleep 3

echo ""
echo "✅ Development Environment Started"
echo ""
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5174"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/backend-dev.log"
echo "  Frontend: tail -f /tmp/frontend-dev.log"
echo ""
echo "To stop:"
echo "  ./scripts/stop-dev.sh"
