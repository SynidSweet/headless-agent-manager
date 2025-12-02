# Headless Agent Manager - Production Deployment Procedure

## Overview

This document provides a complete procedure for deploying changes from the **dev** environment to the **prod** environment. The dev and prod environments run simultaneously on different ports to allow testing before production deployment.

---

## Environment Configuration

### Port Allocation

| Service | Development | Production |
|---------|------------|-----------|
| Backend API | 3001 | 3000 |
| Frontend | 5174 | 5173 |
| Python Proxy | 8000 | 8000 (shared) |
| Database | `agents-dev.db` | `agents.db` |

### Directory Structure

```
/home/dev/projects/mcp-management-system/
├── dev/headless-agent-manager/     # Development (3001, 5174)
└── prod/headless-agent-manager/    # Production (3000, 5173)
```

---

## Pre-Deployment Checklist

### 1. Verify Dev Environment

```bash
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager

# Run all tests
cd backend && npm test
# Expected: All tests passing

# Run smoke tests (optional but recommended)
npm run test:smoke
# Expected: All smoke tests passing

# Check git status
git status
# Expected: All changes committed
```

### 2. Verify Python Proxy Service

```bash
# Check if Python proxy is running
curl -s http://localhost:8000/health
# Expected: {"status":"ok",...}

# If not running, start it:
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
```

---

## Deployment Procedure

### Step 1: Stop Production Services

```bash
# Kill production backend (port 3000)
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "Port 3000 already free"

# Kill production frontend (port 5173)
lsof -ti:5173 | xargs kill -9 2>/dev/null || echo "Port 5173 already free"

# Remove stale PID files
rm -f /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid

# Verify services stopped
lsof -ti:3000 && echo "❌ Port 3000 still in use" || echo "✅ Port 3000 free"
lsof -ti:5173 && echo "❌ Port 5173 still in use" || echo "✅ Port 5173 free"
```

### Step 2: Sync Code from Dev to Prod

```bash
# Navigate to dev directory
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager

# Sync backend
rsync -av --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='data' \
  --exclude='.env.development' \
  backend/ \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/

# Sync frontend
rsync -av --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env.development' \
  frontend/ \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/frontend/

# Sync Python proxy service
rsync -av --delete \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  claude-proxy-service/ \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/claude-proxy-service/

# Sync documentation
rsync -av \
  CLAUDE.md \
  MCP_FEATURE_DESIGN.md \
  MCP_IMPLEMENTATION_COMPLETE.md \
  PORT_ALLOCATION.md \
  SPECIFICATION.md \
  README.md \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/

# Sync scripts if they exist
rsync -av scripts/ /home/dev/projects/mcp-management-system/prod/headless-agent-manager/scripts/ 2>/dev/null || true

echo "✅ Code synced to production"
```

### Step 3: Install Dependencies in Production

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager

# Install backend dependencies
cd backend
npm install
echo "✅ Backend dependencies installed"

# Install frontend dependencies
cd ../frontend
npm install
echo "✅ Frontend dependencies installed"

# Ensure Python proxy venv exists
cd ../claude-proxy-service
if [ ! -d "venv" ]; then
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  echo "✅ Python dependencies installed"
else
  echo "✅ Python venv already exists"
fi
```

### Step 4: Configure Production Environment

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend

# Create production .env if it doesn't exist
cat > .env <<'ENV_EOF'
# Production Environment Configuration
PORT=3000
DATABASE_PATH=./data/agents.db
NODE_ENV=production
REPOSITORY_TYPE=sqlite
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
ENV_EOF

echo "✅ Production .env configured (PORT=3000)"

# Ensure data directory exists
mkdir -p data
echo "✅ Data directory ready"
```

### Step 5: Start Production Services

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager

# Start backend (port 3000)
cd backend
npm run dev > /tmp/prod-backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID, PORT: 3000)"

# Wait for backend to initialize
sleep 3

# Start frontend (port 5173)
cd ../frontend
npm run dev > /tmp/prod-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID, PORT: 5173)"

# Wait for services to start
sleep 5
```

### Step 6: Verify Production Deployment

```bash
# Check backend health
echo "Checking backend health..."
curl -s http://localhost:3000/api/health | python3 -m json.tool
# Expected: {"status":"ok","pid":...}

# Check frontend is responding
echo "Checking frontend..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Expected: 200

# Check if services are running
echo "Production services:"
lsof -ti:3000 && echo "✅ Backend running on port 3000" || echo "❌ Backend not running"
lsof -ti:5173 && echo "✅ Frontend running on port 5173" || echo "❌ Frontend not running"

# Check logs for errors
echo "Recent backend logs:"
tail -20 /tmp/prod-backend.log

echo "Recent frontend logs:"
tail -20 /tmp/prod-frontend.log
```

### Step 7: Systemd Integration (Optional - For Persistence)

If using systemd for production persistence, restart the services:

```bash
# Restart production services via systemd
sudo systemctl restart agent-manager-backend.service
sudo systemctl restart agent-manager-frontend.service

# Verify status
sudo systemctl status agent-manager-backend.service
sudo systemctl status agent-manager-frontend.service

# Check logs
sudo journalctl -u agent-manager-backend.service -n 50
sudo journalctl -u agent-manager-frontend.service -n 50
```

---

## Quick Deployment Script

Save this as `/home/dev/projects/mcp-management-system/deploy-to-prod.sh`:

```bash
#!/bin/bash

set -e  # Exit on error

echo "╔════════════════════════════════════════════════╗"
echo "║  Headless Agent Manager - Deploy to Prod      ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Step 1: Kill production services
echo "[1/6] Stopping production services..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
rm -f /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid
sleep 2
echo "✅ Production services stopped"

# Step 2: Sync code
echo "[2/6] Syncing code to production..."
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager

rsync -av --delete --exclude='node_modules' --exclude='dist' --exclude='data' --exclude='.env.development' \
  backend/ /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/

rsync -av --delete --exclude='node_modules' --exclude='dist' --exclude='.env.development' \
  frontend/ /home/dev/projects/mcp-management-system/prod/headless-agent-manager/frontend/

rsync -av --delete --exclude='venv' --exclude='__pycache__' --exclude='*.pyc' \
  claude-proxy-service/ /home/dev/projects/mcp-management-system/prod/headless-agent-manager/claude-proxy-service/

rsync -av *.md /home/dev/projects/mcp-management-system/prod/headless-agent-manager/ 2>/dev/null || true

echo "✅ Code synced"

# Step 3: Install dependencies
echo "[3/6] Installing production dependencies..."
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend
npm install --silent > /dev/null 2>&1
cd ../frontend
npm install --silent > /dev/null 2>&1
echo "✅ Dependencies installed"

# Step 4: Configure environment
echo "[4/6] Configuring production environment..."
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend

cat > .env <<'EOF'
PORT=3000
DATABASE_PATH=./data/agents.db
NODE_ENV=production
REPOSITORY_TYPE=sqlite
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
EOF

mkdir -p data
echo "✅ Environment configured"

# Step 5: Start services
echo "[5/6] Starting production services..."
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend
npm run dev > /tmp/prod-backend.log 2>&1 &
sleep 3

cd ../frontend
npm run dev > /tmp/prod-frontend.log 2>&1 &
sleep 3

echo "✅ Services started"

# Step 6: Verify
echo "[6/6] Verifying deployment..."
HEALTH=$(curl -s http://localhost:3000/api/health)
if echo "$HEALTH" | grep -q "ok"; then
  echo "✅ Backend healthy"
else
  echo "❌ Backend health check failed"
  exit 1
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200"; then
  echo "✅ Frontend responding"
else
  echo "❌ Frontend not responding"
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Deployment Complete                        ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  Backend:  http://localhost:3000               ║"
echo "║  Frontend: http://localhost:5173               ║"
echo "║  Health:   http://localhost:3000/api/health    ║"
echo "╚════════════════════════════════════════════════╝"
```

---

## Rollback Procedure

If deployment fails, quickly rollback:

```bash
# Step 1: Stop broken production services
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Step 2: Check git history for last working commit
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager
git log --oneline -5

# Step 3: Checkout previous commit
git checkout <previous-commit-hash>

# Step 4: Re-deploy using the procedure above

# Step 5: Return to latest after fixing
git checkout main
```

---

## Monitoring Production

### Health Checks

```bash
# Backend health
watch -n 5 'curl -s http://localhost:3000/api/health | jq'

# Check active agents
curl -s http://localhost:3000/api/agents | jq

# Check logs
tail -f /tmp/prod-backend.log
tail -f /tmp/prod-frontend.log
```

### Service Status

```bash
# Check if services are running
ps aux | grep -E "node.*3000|vite.*5173" | grep -v grep

# Check ports
lsof -ti:3000  # Backend PID
lsof -ti:5173  # Frontend PID

# Check systemd status (if using systemd)
sudo systemctl status agent-manager-backend.service
sudo systemctl status agent-manager-frontend.service
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check for existing instance
cat /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid
ps aux | grep <PID>

# Remove stale PID
rm -f /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid

# Check logs
tail -50 /tmp/prod-backend.log

# Verify environment
cat /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/.env
```

### Frontend Can't Connect to Backend

```bash
# Verify backend is accessible
curl http://localhost:3000/api/health

# Check frontend environment (should point to port 3000)
cat /home/dev/projects/mcp-management-system/prod/headless-agent-manager/frontend/.env.production

# Check CORS configuration
grep -A10 "enableCors" /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/src/main.ts
```

### Port Conflicts

```bash
# Find what's using the port
lsof -ti:3000
ps aux | grep <PID>

# Kill the process
kill -9 <PID>

# Or kill all node processes (CAREFUL!)
pkill -9 node
```

### Python Proxy Issues

```bash
# Check Python proxy health
curl http://localhost:8000/health

# Restart Python proxy
pkill -f uvicorn
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/python-proxy.log 2>&1 &
```

---

## Database Considerations

### Production Database Backup

```bash
# Backup production database BEFORE deployment
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data
cp agents.db agents.db.backup-$(date +%Y%m%d-%H%M%S)

# List backups
ls -lh agents.db.backup-*
```

### Database Migration (If Schema Changed)

```bash
# Check if schema changed
git diff HEAD~1 HEAD -- backend/src/infrastructure/database/

# If migrations exist, run them
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend
npm run migration:run  # If you have migration scripts

# Verify database integrity
sqlite3 data/agents.db "PRAGMA integrity_check;"
# Expected: ok
```

---

## Verification Checklist

After deployment, verify all functionality:

- [ ] ✅ Backend health endpoint responds: `curl http://localhost:3000/api/health`
- [ ] ✅ Frontend loads: Open `http://localhost:5173` in browser
- [ ] ✅ Can list agents: `curl http://localhost:3000/api/agents`
- [ ] ✅ Can launch agent: Test via frontend UI or API
- [ ] ✅ WebSocket connection works: Check browser console
- [ ] ✅ Messages stream correctly: Launch agent and watch messages
- [ ] ✅ No errors in logs: `tail -50 /tmp/prod-backend.log`
- [ ] ✅ Database accessible: `sqlite3 prod/backend/data/agents.db "SELECT COUNT(*) FROM agents;"`

---

## Environment Variables

### Production Backend (.env)

```env
PORT=3000
DATABASE_PATH=./data/agents.db
NODE_ENV=production
REPOSITORY_TYPE=sqlite
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
```

### Production Frontend (.env.production)

```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

---

## Systemd Service Configuration (Optional)

For production persistence across reboots, use systemd services.

### Backend Service

File: `/etc/systemd/system/agent-manager-backend.service`

```ini
[Unit]
Description=Headless Agent Manager - Backend API (Production)
After=network.target

[Service]
Type=simple
User=dev
WorkingDirectory=/home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=REPOSITORY_TYPE=sqlite
Environment=DATABASE_PATH=./data/agents.db
Environment=CLAUDE_ADAPTER=python-proxy
Environment=CLAUDE_PROXY_URL=http://localhost:8000
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Frontend Service

File: `/etc/systemd/system/agent-manager-frontend.service`

```ini
[Unit]
Description=Headless Agent Manager - Frontend (Production)
After=network.target

[Service]
Type=simple
User=dev
WorkingDirectory=/home/dev/projects/mcp-management-system/prod/headless-agent-manager/frontend
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable agent-manager-backend.service
sudo systemctl enable agent-manager-frontend.service

# Start services
sudo systemctl start agent-manager-backend.service
sudo systemctl start agent-manager-frontend.service

# Check status
sudo systemctl status agent-manager-backend.service
sudo systemctl status agent-manager-frontend.service
```

---

## Post-Deployment Tasks

### Update Documentation

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager

# Update deployment timestamp in docs
echo "Last deployed: $(date -Iseconds)" >> DEPLOYMENT_LOG.md

# Document any configuration changes
# Update CLAUDE.md if needed
```

### Notify Stakeholders

- Deployment complete
- New features available (e.g., MCP configuration)
- Known issues (if any)
- Testing recommendations

---

## Quick Reference Commands

### Check Service Status
```bash
# All in one
curl -s http://localhost:3000/api/health && echo "✅ Backend OK" || echo "❌ Backend Down"
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200" && echo "✅ Frontend OK" || echo "❌ Frontend Down"
```

### Restart Production
```bash
# Quick restart (preserve data)
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager
cd backend && npm run dev > /tmp/prod-backend.log 2>&1 &
cd ../frontend && npm run dev > /tmp/prod-frontend.log 2>&1 &
```

### View Logs
```bash
# Backend
tail -f /tmp/prod-backend.log

# Frontend
tail -f /tmp/prod-frontend.log

# Python Proxy
tail -f /tmp/python-proxy.log
```

---

## Emergency Procedures

### Complete System Shutdown

```bash
# Kill all services
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Verify all stopped
lsof -ti:3000,3001,5173,5174,8000 || echo "✅ All ports free"
```

### Nuclear Reset (CAREFUL!)

```bash
# Stop everything
lsof -ti:3000,3001,5173,5174,8000 | xargs kill -9 2>/dev/null || true

# Remove all data (CAREFUL! THIS DELETES DATA!)
rm -rf /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/*
rm -rf /home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend/data/*

# Reinstall dependencies
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Restart
cd backend && npm run dev > /tmp/prod-backend.log 2>&1 &
cd ../frontend && npm run dev > /tmp/prod-frontend.log 2>&1 &
```

---

## Deployment Checklist

**Pre-Deployment:**
- [ ] All dev tests passing (npm test)
- [ ] Smoke tests passing (npm run test:smoke)
- [ ] Git changes committed
- [ ] Git pushed to remote
- [ ] Python proxy service running

**During Deployment:**
- [ ] Production services stopped
- [ ] Code synced to prod
- [ ] Dependencies installed
- [ ] Environment configured (PORT=3000)
- [ ] Services restarted
- [ ] Health checks pass

**Post-Deployment:**
- [ ] Backend responding (port 3000)
- [ ] Frontend loading (port 5173)
- [ ] Can launch agents
- [ ] Messages stream correctly
- [ ] No errors in logs
- [ ] Deployment documented

---

**Last Updated**: 2025-12-02
**Version**: 1.0
**Author**: Claude Code
