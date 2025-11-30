# Port Allocation Strategy

## Overview

To allow **dev** and **prod** environments to run simultaneously without conflicts, we use different port allocations.

---

## Port Assignments

### Production Environment (Standard Ports)
| Service | Port | URL |
|---------|------|-----|
| Backend | 3000 | http://localhost:3000 |
| Frontend | 5173 | http://localhost:5173 |
| Python Proxy | 8000 | http://localhost:8000 |

**Location**: `/prod/headless-agent-manager/` (when deployed)

**Start Command**:
```bash
cd /prod/headless-agent-manager
npm run dev  # Backend on 3000
cd frontend && npm run dev  # Frontend on 5173
```

---

### Development Environment (Alternate Ports)
| Service | Port | URL |
|---------|------|-----|
| Backend | 3001 | http://localhost:3001 |
| Frontend | 5174 | http://localhost:5174 |
| Python Proxy | 8000 | http://localhost:8000 (shared) |

**Location**: `/dev/headless-agent-manager/` (current directory)

**Start Command**:
```bash
cd /dev/headless-agent-manager
./scripts/start-dev.sh
```

**Stop Command**:
```bash
./scripts/stop-dev.sh
```

---

## Configuration Files

### Backend

**Development** (`.env.development`):
```env
PORT=3001
DATABASE_PATH=./data/agents-dev.db
NODE_ENV=development
```

**Production** (`.env` or default):
```env
PORT=3000
DATABASE_PATH=./data/agents.db
NODE_ENV=production
```

### Frontend

**Development** (`.env.development`):
```env
VITE_PORT=5174
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
```

**Production** (`.env.production` or defaults):
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

---

## CORS Configuration

Backend allows connections from:
- `http://localhost:5173` (prod frontend)
- `http://localhost:5174` (dev frontend)
- `http://localhost:3000`
- `https://agents.petter.ai` (remote access)

See `backend/src/main.ts:23-27`

---

## Database Separation

### Development
- Database: `backend/data/agents-dev.db`
- Separate from production data
- Safe for testing and experimentation

### Production
- Database: `backend/data/agents.db`
- Production data
- Should be backed up regularly

---

## Running Both Environments Simultaneously

**Use Case**: Test changes in dev while prod is still serving users

```bash
# Terminal 1: Start prod environment
cd ../prod/headless-agent-manager
npm run dev  # Backend on 3000
cd frontend && npm run dev  # Frontend on 5173

# Terminal 2: Start dev environment
cd ../dev/headless-agent-manager
./scripts/start-dev.sh  # Backend on 3001, Frontend on 5174
```

**Access**:
- Prod: http://localhost:5173
- Dev: http://localhost:5174

**No conflicts!** ✅

---

## Health Checks

### Development
```bash
# Backend health
curl http://localhost:3001/api/health

# Frontend
curl http://localhost:5174
```

### Production
```bash
# Backend health
curl http://localhost:3000/api/health

# Frontend
curl http://localhost:5173
```

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using a port
lsof -ti:3001
lsof -ti:5174

# Kill specific port
lsof -ti:3001 | xargs kill -9
lsof -ti:5174 | xargs kill -9

# Or use the stop script
./scripts/stop-dev.sh
```

### Backend Won't Start (Instance Already Running)

```bash
# Remove stale PID file
rm -f backend/data/backend.pid

# Kill process
kill -9 <PID>

# Restart
./scripts/start-dev.sh
```

### Frontend Can't Connect to Backend

1. Check backend is running: `curl http://localhost:3001/api/health`
2. Check frontend environment: `cat frontend/.env.development`
3. Verify CORS allows frontend port
4. Check browser console for errors

---

## Quick Reference

| Environment | Backend | Frontend | Database |
|-------------|---------|----------|----------|
| **Dev** | 3001 | 5174 | `agents-dev.db` |
| **Prod** | 3000 | 5173 | `agents.db` |

**Scripts**:
- Start dev: `./scripts/start-dev.sh`
- Stop dev: `./scripts/stop-dev.sh`
- Start prod: Standard `npm run dev` commands

---

**Last Updated**: 2025-11-30
