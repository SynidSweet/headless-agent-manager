# Headless Agent Manager - Complete Deployment Procedure v2

**Last Updated:** 2025-12-13
**Status:** Production-Validated
**Changes:** Added critical package build step, improved sync procedure

---

## 🚨 Critical Deployment Steps (MUST Follow)

This deployment procedure fixes the issues encountered where production failed due to missing package builds.

### **Why This Matters**
- The `@headless-agent-manager/client` package must be **built** before the frontend can use it
- Simple file sync is **not enough** - the TypeScript code must be compiled
- Missing this step causes runtime errors like "You must pass a selector to useSelector"

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

## Complete Deployment Procedure

### Step 1: Pre-Deployment Checks

```bash
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager

# 1. Verify all tests pass
cd backend && npm test
# Expected: All tests passing

# 2. Commit all changes
git status
# Expected: Clean working tree or committed changes

# 3. Verify Python proxy is running
curl -s http://localhost:8000/health | grep -q "ok" && echo "✅ Proxy healthy" || echo "❌ Proxy down"
```

### Step 2: Stop Production Services

```bash
# Kill production backend (port 3000)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Kill production frontend (port 5173)
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Remove stale PID files
rm -f /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid

# Verify ports are free
lsof -ti:3000,5173 && echo "❌ Ports still in use" || echo "✅ Ports free"
```

### Step 3: Sync Code from Dev to Prod

```bash
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
  --exclude='.env.test' \
  frontend/ \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/frontend/

# 🚨 CRITICAL: Sync packages folder (including source)
rsync -av --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  packages/ \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/packages/

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
  SPECIFICATION.md \
  README.md \
  /home/dev/projects/mcp-management-system/prod/headless-agent-manager/

echo "✅ Code synced to production"
```

### Step 4: 🚨 BUILD PACKAGES (CRITICAL!)

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager

# 🚨 CRITICAL STEP: Build the agent-manager-client package
echo "Building @headless-agent-manager/client package..."
cd packages/agent-manager-client
npm install --silent
npm run build

# Verify build succeeded
if [ -f "dist/index.js" ] && [ -f "dist/index.d.ts" ]; then
  BUILD_SIZE=$(stat -f%z dist/index.d.ts 2>/dev/null || stat -c%s dist/index.d.ts)
  echo "✅ Package built successfully (index.d.ts: ${BUILD_SIZE} bytes)"

  # Check if build includes providers (file should be > 70KB)
  if [ "$BUILD_SIZE" -gt 70000 ]; then
    echo "✅ Build includes all features (providers, etc.)"
  else
    echo "⚠️  WARNING: Build may be missing features (expected >70KB)"
  fi
else
  echo "❌ Build failed - missing output files!"
  exit 1
fi
```

### Step 5: Install Dependencies

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install --silent
echo "✅ Backend dependencies installed"

# Install frontend dependencies (will link to built package)
echo "Installing frontend dependencies..."
cd ../frontend

# Clear Vite cache before installing
rm -rf node_modules/.vite
echo "✅ Cleared Vite cache"

npm install --silent
echo "✅ Frontend dependencies installed"
```

### Step 6: Configure Production Environment

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend

# Create/update production .env
cat > .env <<'EOF'
# Production Environment Configuration
PORT=3000
DATABASE_PATH=./data/agents.db
NODE_ENV=production
REPOSITORY_TYPE=sqlite
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
EOF

echo "✅ Production .env configured"

# Ensure data directory exists
mkdir -p data
echo "✅ Data directory ready"
```

### Step 7: Start Production Services

```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager

# Start backend (port 3000)
echo "Starting backend..."
cd backend
npm run dev > /tmp/prod-backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID, PORT: 3000)"

# Wait for backend to initialize
sleep 5

# Verify backend is healthy
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
  echo "✅ Backend health check passed"
else
  echo "❌ Backend health check failed"
  tail -20 /tmp/prod-backend.log
  exit 1
fi

# Start frontend (port 5173)
echo "Starting frontend..."
cd ../frontend
npm run dev > /tmp/prod-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID, PORT: 5173)"

# Wait for frontend to build
sleep 8

# Verify frontend is responding
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173)
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo "✅ Frontend health check passed"
else
  echo "❌ Frontend not responding (HTTP $FRONTEND_STATUS)"
  tail -20 /tmp/prod-frontend.log
  exit 1
fi
```

### Step 8: Verify Production Deployment

```bash
echo ""
echo "=== Production Verification ==="
echo ""

# 1. Check backend health
echo "1. Backend Health:"
curl -s http://localhost:3000/api/health | python3 -m json.tool | head -15

# 2. Check providers endpoint (verify package built correctly)
echo ""
echo "2. Providers Endpoint:"
curl -s http://localhost:3000/api/providers | python3 -m json.tool | grep -E '"type"|"name"' | head -8

# 3. Check frontend is serving
echo ""
echo "3. Frontend Status:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:5173

# 4. Check running processes
echo ""
echo "4. Running Services:"
lsof -ti:3000 && echo "✅ Backend running on port 3000" || echo "❌ Backend not running"
lsof -ti:5173 && echo "✅ Frontend running on port 5173" || echo "❌ Frontend not running"

# 5. Check package build in frontend node_modules
echo ""
echo "5. Package Build Verification:"
PACKAGE_SIZE=$(stat -f%z /home/dev/projects/mcp-management-system/prod/headless-agent-manager/packages/agent-manager-client/dist/index.d.ts 2>/dev/null || stat -c%s /home/dev/projects/mcp-management-system/prod/headless-agent-manager/packages/agent-manager-client/dist/index.d.ts)
echo "Package build size: ${PACKAGE_SIZE} bytes"
if [ "$PACKAGE_SIZE" -gt 70000 ]; then
  echo "✅ Package includes all features"
else
  echo "⚠️  Package may be missing features"
fi

echo ""
echo "=== Deployment Verification Complete ==="
```

---

## Automated Deployment Script

Save this as `/home/dev/projects/mcp-management-system/deploy-to-prod-v2.sh`:

```bash
#!/bin/bash

set -e  # Exit on error

echo "╔════════════════════════════════════════════════╗"
echo "║  Headless Agent Manager - Deploy to Prod v2   ║"
echo "║  (Includes package build step)                 ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

BASE_DIR="/home/dev/projects/mcp-management-system"
DEV_DIR="$BASE_DIR/dev/headless-agent-manager"
PROD_DIR="$BASE_DIR/prod/headless-agent-manager"

# Step 1: Stop production services
echo "[1/8] Stopping production services..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
rm -f "$PROD_DIR/backend/data/backend.pid"
sleep 2
echo "✅ Production services stopped"

# Step 2: Sync code
echo "[2/8] Syncing code to production..."
cd "$DEV_DIR"

rsync -a --delete --exclude='node_modules' --exclude='dist' --exclude='data' --exclude='.env.development' \
  backend/ "$PROD_DIR/backend/"

rsync -a --delete --exclude='node_modules' --exclude='dist' --exclude='.env.*' \
  frontend/ "$PROD_DIR/frontend/"

rsync -a --delete --exclude='node_modules' --exclude='dist' \
  packages/ "$PROD_DIR/packages/"

rsync -a --delete --exclude='venv' --exclude='__pycache__' --exclude='*.pyc' \
  claude-proxy-service/ "$PROD_DIR/claude-proxy-service/"

rsync -a *.md "$PROD_DIR/" 2>/dev/null || true

echo "✅ Code synced"

# Step 3: 🚨 Build packages
echo "[3/8] Building packages (CRITICAL STEP)..."
cd "$PROD_DIR/packages/agent-manager-client"
npm install --silent > /dev/null 2>&1
npm run build > /dev/null 2>&1

# Verify build
if [ ! -f "dist/index.js" ]; then
  echo "❌ Package build failed!"
  exit 1
fi

BUILD_SIZE=$(stat -c%s dist/index.d.ts 2>/dev/null || stat -f%z dist/index.d.ts)
echo "✅ Package built (${BUILD_SIZE} bytes)"

# Step 4: Install backend dependencies
echo "[4/8] Installing backend dependencies..."
cd "$PROD_DIR/backend"
npm install --silent > /dev/null 2>&1
echo "✅ Backend dependencies installed"

# Step 5: Install frontend dependencies
echo "[5/8] Installing frontend dependencies..."
cd "$PROD_DIR/frontend"
rm -rf node_modules/.vite
npm install --silent > /dev/null 2>&1
echo "✅ Frontend dependencies installed"

# Step 6: Configure environment
echo "[6/8] Configuring production environment..."
cd "$PROD_DIR/backend"

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

# Step 7: Start services
echo "[7/8] Starting production services..."
cd "$PROD_DIR/backend"
npm run dev > /tmp/prod-backend.log 2>&1 &
sleep 5

cd "$PROD_DIR/frontend"
npm run dev > /tmp/prod-frontend.log 2>&1 &
sleep 8

echo "✅ Services started"

# Step 8: Verify
echo "[8/8] Verifying deployment..."

# Check backend
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
  echo "✅ Backend healthy"
else
  echo "❌ Backend health check failed"
  tail -20 /tmp/prod-backend.log
  exit 1
fi

# Check frontend
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173)
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo "✅ Frontend responding"
else
  echo "❌ Frontend not responding"
  tail -20 /tmp/prod-frontend.log
  exit 1
fi

# Check providers endpoint (critical - verifies package built correctly)
if curl -s http://localhost:3000/api/providers | grep -q "claude-code"; then
  echo "✅ Providers endpoint working (package built correctly)"
else
  echo "⚠️  WARNING: Providers endpoint may have issues"
fi

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Deployment Complete                        ║"
echo "╠════════════════════════════════════════════════╣"
echo "║  Backend:  http://localhost:3000               ║"
echo "║  Frontend: http://localhost:5173               ║"
echo "║  Health:   http://localhost:3000/api/health    ║"
echo "║  Domain:   https://agents.petter.ai            ║"
echo "╚════════════════════════════════════════════════╝"
```

---

## Rollback Procedure

If deployment fails:

```bash
# Step 1: Stop broken services
lsof -ti:3000,5173 | xargs kill -9 2>/dev/null || true

# Step 2: Check git history
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager
git log --oneline -5

# Step 3: Checkout previous commit
git checkout <previous-commit-hash>

# Step 4: Re-run deployment
/home/dev/projects/mcp-management-system/deploy-to-prod-v2.sh

# Step 5: Return to latest after fixing
git checkout main
```

---

## Troubleshooting

### Issue: "You must pass a selector to useSelector"

**Root Cause:** Package not built or using old build

**Solution:**
```bash
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/packages/agent-manager-client

# Rebuild package
npm run build

# Check build size (should be >70KB)
ls -lh dist/index.d.ts

# Clear frontend cache and reinstall
cd ../../frontend
rm -rf node_modules/.vite
npm install

# Restart frontend
lsof -ti:5173 | xargs kill -9
npm run dev > /tmp/prod-frontend.log 2>&1 &
```

### Issue: Backend Won't Start

```bash
# Check for existing instance
cat /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid
ps aux | grep <PID>

# Remove stale PID
rm -f /home/dev/projects/mcp-management-system/prod/headless-agent-manager/backend/data/backend.pid

# Check logs
tail -50 /tmp/prod-backend.log
```

### Issue: Frontend Build Errors

```bash
# Check package is built
ls -lh /home/dev/projects/mcp-management-system/prod/headless-agent-manager/packages/agent-manager-client/dist/

# Rebuild if missing
cd /home/dev/projects/mcp-management-system/prod/headless-agent-manager/packages/agent-manager-client
npm run build

# Clear caches
cd ../../frontend
rm -rf node_modules/.vite node_modules/.cache
npm install
```

---

## Deployment Checklist

**Pre-Deployment:**
- [ ] All dev tests passing
- [ ] Git changes committed and pushed
- [ ] Python proxy service running

**During Deployment:**
- [ ] Production services stopped
- [ ] Code synced to prod
- [ ] **🚨 Packages built** (critical!)
- [ ] Dependencies installed
- [ ] Environment configured
- [ ] Services restarted

**Post-Deployment:**
- [ ] Backend health check passes
- [ ] Frontend loads (HTTP 200)
- [ ] Providers endpoint works
- [ ] Can launch agents via UI
- [ ] Messages stream correctly
- [ ] No errors in console

---

**Version:** 2.0
**Date:** 2025-12-13
**Validated:** Production deployment successful with package build
