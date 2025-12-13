#!/bin/bash
# Start Claude Proxy Service
# This script starts the Python microservice that proxies Claude CLI requests

set -e

# Navigate to service directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found"
    echo "   Create it: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Check if Claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI not found"
    echo "   Install it: npm install -g @anthropic/claude-cli"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Check if already running
if lsof -ti:8000 &> /dev/null; then
    echo "⚠️  Service already running on port 8000"
    echo "   Stop it: kill \$(lsof -ti:8000)"
    exit 1
fi

# Start service
echo "🚀 Starting Claude Proxy Service..."
echo "   Port: 8000"
echo "   Logs: /tmp/python-proxy.log"
echo ""

nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/python-proxy.log 2>&1 &

# Wait for service to start
sleep 2

# Check if started successfully
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Service started successfully"
    echo ""
    echo "Health check: curl http://localhost:8000/health"
    echo "API docs:     http://localhost:8000/docs"
    echo "Logs:         tail -f /tmp/python-proxy.log"
else
    echo "❌ Service failed to start"
    echo "   Check logs: tail -f /tmp/python-proxy.log"
    exit 1
fi
