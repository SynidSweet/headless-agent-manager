#!/bin/bash

# Stop all services for Headless AI Agent Manager

echo "🛑 Stopping Headless AI Agent Management System..."

# Kill processes by port
for port in 5173 3000 8000; do
    pid=$(lsof -ti:$port)
    if [ -n "$pid" ]; then
        echo "Stopping service on port $port (PID: $pid)..."
        kill -9 $pid 2>/dev/null || true
    fi
done

# Kill by process name
pkill -f "uvicorn app.main:app" || true
pkill -f "npm run dev" || true
pkill -f "ts-node-dev" || true
pkill -f "vite" || true

echo "✅ All services stopped"
