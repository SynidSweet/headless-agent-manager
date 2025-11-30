#!/bin/bash
# Stop Development Environment

echo "🛑 Stopping Development Environment"
echo ""

echo "Stopping backend (port 3001)..."
lsof -ti:3001 | xargs -r kill -9 2>/dev/null || echo "  No backend running"

echo "Stopping frontend (port 5174)..."
lsof -ti:5174 | xargs -r kill -9 2>/dev/null || echo "  No frontend running"

echo "Cleaning up PID files..."
rm -f backend/data/backend.pid

echo ""
echo "✅ Development environment stopped"
