#!/bin/bash
# Stop Claude Proxy Service

set -e

if lsof -ti:8000 &> /dev/null; then
    echo "🛑 Stopping Claude Proxy Service..."
    kill $(lsof -ti:8000)
    sleep 1
    echo "✅ Service stopped"
else
    echo "⚠️  Service not running on port 8000"
fi
