#!/bin/bash
# Verify production and development environments are correctly separated

echo "=== Environment Verification ==="
echo ""

echo "Production Backend (port 3000):"
curl -s http://localhost:3000/api/health > /dev/null && echo "  ✅ Responding" || echo "  ❌ Not responding"

echo "Development Backend (port 3001):"
curl -s http://localhost:3001/api/health > /dev/null && echo "  ✅ Responding" || echo "  ❌ Not responding"

echo ""
echo "Production Frontend (port 5173):"
curl -s http://localhost:5173 > /dev/null && echo "  ✅ Responding" || echo "  ❌ Not responding"

echo "Development Frontend (port 5174):"
curl -s http://localhost:5174 > /dev/null && echo "  ✅ Responding" || echo "  ❌ Not responding"

echo ""
echo "Python Proxy (port 8000):"
curl -s http://localhost:8000/health > /dev/null && echo "  ✅ Responding" || echo "  ❌ Not responding"

echo ""
echo "=== Port Allocation ==="
lsof -ti:3000 >/dev/null && echo "Port 3000: $(ps -p $(lsof -ti:3000) -o command= | head -c 60)" || echo "Port 3000: Not in use"
lsof -ti:3001 >/dev/null && echo "Port 3001: $(ps -p $(lsof -ti:3001) -o command= | head -c 60)" || echo "Port 3001: Not in use"
lsof -ti:5173 >/dev/null && echo "Port 5173: $(ps -p $(lsof -ti:5173) -o command= | head -c 60)" || echo "Port 5173: Not in use"
lsof -ti:5174 >/dev/null && echo "Port 5174: $(ps -p $(lsof -ti:5174) -o command= | head -c 60)" || echo "Port 5174: Not in use"
