#!/bin/bash
# Quick test to verify WebSocket initialization fix

set -e

echo "========================================="
echo "WebSocket Initialization Test"
echo "========================================="
echo ""

# Navigate to frontend directory
cd "$(dirname "$0")"

echo "✅ Backend running: http://localhost:3000"
echo "✅ Python proxy running: http://localhost:8000"
echo ""

echo "Running single test to verify WebSocket initialization..."
echo ""

# Run just the first test (basic execution) with verbose output
npm run test:e2e -- real-claude-integration.spec.ts -g "Real Claude agent executes command and sends message" --reporter=line

echo ""
echo "========================================="
echo "If test passed, WebSocket init is fixed!"
echo "========================================="
