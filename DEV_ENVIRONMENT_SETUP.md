# Development Environment - Complete Setup ✅

**Status**: Fully configured and running with refactored module
**Last Updated**: 2025-11-30

---

## Quick Start

```bash
# Start dev environment
./scripts/start-dev.sh

# Access
# - Frontend: http://localhost:5174
# - Backend:  http://localhost:3001
# - API:      http://localhost:3001/api

# Stop dev environment
./scripts/stop-dev.sh
```

---

## Port Allocation

| Environment | Backend | Frontend | Database |
|-------------|---------|----------|----------|
| **Dev** | 3001 | 5174 | `agents-dev.db` |
| **Prod** | 3000 | 5173 | `agents.db` |

**Why Different Ports?**
- Allows dev and prod to run simultaneously
- No port conflicts
- Separate databases for isolation
- Easy testing and deployment

---

## Current Status

### ✅ Development Environment (Active)
```
Backend:  http://localhost:3001 ✅ Running
Frontend: http://localhost:5174 ✅ Running
Module:   @headless-agent-manager/client v1.0.0 ✅ Built
```

### 📦 Production Environment (Available)
```
Ports:    3000 (backend), 5173 (frontend)
Location: ../prod/headless-agent-manager/ (to be deployed)
Status:   Ready to deploy
```

---

## What's Running in Dev

### Refactored Module Features
1. ✅ **No duplicate code** - All removed
2. ✅ **Redux single source of truth** - Clean state management
3. ✅ **Automatic WebSocket** - Via middleware
4. ✅ **Message aggregation** - Utility from module
5. ✅ **12 reusable hooks** - Clean component integration
6. ✅ **100% test success** - 199/199 tests passing

### Services
- **Backend** (NestJS on 3001)
  - REST API: `/api/*`
  - WebSocket: Socket.IO
  - Database: SQLite (`agents-dev.db`)
  - Process management: Single instance enforcement

- **Frontend** (React + Vite on 5174)
  - Uses `@headless-agent-manager/client` module
  - Redux state management
  - Real-time WebSocket updates
  - Clean component architecture

---

## Configuration Files

### Backend
- `.env.development` - Dev-specific config (PORT=3001)
- `src/main.ts` - CORS includes both 5173 and 5174
- `data/agents-dev.db` - Separate dev database

### Frontend
- `.env.development` - Dev ports and backend URL
- `vite.config.ts` - Reads VITE_PORT from env
- `src/store/store.ts` - Module configuration

---

## Scripts

### Start Development
```bash
./scripts/start-dev.sh
```

**What it does**:
- Kills any existing dev processes
- Starts backend on port 3001
- Starts frontend on port 5174
- Shows PIDs and URLs
- Logs to /tmp/

### Stop Development
```bash
./scripts/stop-dev.sh
```

**What it does**:
- Stops backend (port 3001)
- Stops frontend (port 5174)
- Cleans up PID files

---

## Testing

### Run All Tests
```bash
# Module tests (106 tests)
cd packages/agent-manager-client
npm test -- --run

# Frontend tests (93 tests)
cd frontend
npm test -- --run

# E2E tests (requires backend running)
npm run test:e2e
```

### Manual Testing
1. Open http://localhost:5174
2. Launch an agent
3. Verify real-time message streaming
4. Check WebSocket connection status
5. Test agent termination

---

## Logs

### View Logs
```bash
# Backend
tail -f /tmp/backend-dev.log

# Frontend
tail -f /tmp/frontend-dev.log
```

### Health Checks
```bash
# Backend health
curl http://localhost:3001/api/health

# Frontend serving
curl http://localhost:5174
```

---

## Next Steps

### Deploy to Production
1. Copy/clone to `../prod/headless-agent-manager/`
2. Use standard ports (3000/5173)
3. Update `.env` for production
4. Build and deploy

See `PORT_ALLOCATION.md` for complete port strategy.

---

## Troubleshooting

### Services Won't Start
```bash
# Check what's using the ports
lsof -ti:3001
lsof -ti:5174

# Kill and restart
./scripts/stop-dev.sh
./scripts/start-dev.sh
```

### Frontend Can't Connect to Backend
1. Verify backend is running: `curl http://localhost:3001/api/health`
2. Check frontend .env.development has correct URLs
3. Verify CORS allows port 5174
4. Check browser console

### Module Not Updated
```bash
# Rebuild module
cd packages/agent-manager-client
npm run build

# Rebuild frontend
cd ../../frontend
npm run build
```

---

**Status**: ✅ Dev environment fully configured and running with refactored module
**Ready for**: Production deployment to `../prod/`
