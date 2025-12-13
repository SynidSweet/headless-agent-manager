# AI Agent Development Guide

## Quick Reference

### Port Allocation

| Service | Production | Development | Purpose |
|---------|-----------|-------------|---------|
| Backend | 3000 | 3001 | API & WebSocket |
| Frontend | 5173 | 5174 | React UI |
| Python Proxy | 8000 | 8000 | Claude CLI proxy (shared) |

### Domains

- **Production**: https://agents.petter.ai (port 3000/5173)
- **Development**: https://agents.dev.petter.ai (port 3001/5174)

### Environment Rules

1. **NEVER touch production** (port 3000/5173) when developing
2. **ALWAYS use development** (port 3001/5174) for testing
3. **E2E tests use development** ports
4. **Smoke tests can run in any environment** (they specify their config)

## Starting Development Environment

```bash
# From project root
./scripts/start-dev.sh

# Verify it's working
./scripts/verify-env.sh
```

Expected output:
```
Development Backend (port 3001): ✅ Responding
Development Frontend (port 5174): ✅ Responding
```

## Stopping Development Environment

```bash
./scripts/stop-dev.sh
```

## Running Tests

### Unit + Integration Tests
```bash
cd backend
npm test
```

### E2E Tests (requires dev environment running)
```bash
# Terminal 1: Start dev environment
./scripts/start-dev.sh

# Terminal 2: Run E2E tests
cd frontend
npm run test:e2e
```

### Smoke Tests (real Claude CLI)
```bash
cd backend
npm run test:smoke
```

## Troubleshooting

### "Port 3001 already in use"
```bash
# Kill dev backend
kill $(lsof -ti:3001)

# Restart
./scripts/start-dev.sh
```

### "E2E tests failing - backend not responding"
```bash
# Verify dev backend is on 3001
curl http://localhost:3001/api/health

# If not responding, restart dev environment
./scripts/stop-dev.sh
./scripts/start-dev.sh
```

### "Dev backend showing production data"
This means it's on wrong port. Check:
```bash
# Should show port 3001
cat backend/data/backend.pid | grep port
```

If it shows 3000, restart with NODE_ENV:
```bash
cd backend
NODE_ENV=development PORT=3001 npm run dev
```

## Environment Variables

### Backend (.env.development)
```env
PORT=3001
REPOSITORY_TYPE=sqlite
DATABASE_PATH=./data/agents-dev.db
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
NODE_ENV=development
```

### Frontend (.env.development)
```env
VITE_PORT=5174
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
```

## Common Mistakes

### ❌ Starting backend without NODE_ENV
```bash
# Wrong - will use .env (production)
PORT=3001 npm run dev
```

### ✅ Correct way
```bash
# Correct - will use .env.development
NODE_ENV=development PORT=3001 npm run dev

# Or use the script
./scripts/start-dev.sh
```

### ❌ E2E tests configured for production ports
```typescript
// Wrong in playwright.config.ts
baseURL: 'http://localhost:5173', // Production port!
```

### ✅ Correct configuration
```typescript
// Correct in playwright.config.ts
baseURL: 'http://localhost:5174', // Dev port
```

## How It Works

### ConfigModule Environment Loading
The backend uses NestJS ConfigModule with explicit environment file loading:

```typescript
ConfigModule.forRoot({
  envFilePath: [
    `.env.${process.env.NODE_ENV || 'development'}`,
    '.env'
  ],
  isGlobal: true,
})
```

**Precedence:**
1. If `NODE_ENV=development` → loads `.env.development`
2. If `NODE_ENV=production` → loads `.env.production`
3. If no `NODE_ENV` → loads `.env.development` (default)
4. Falls back to `.env` for any missing variables

### Start Script with NODE_ENV
```bash
NODE_ENV=development PORT=3001 npm run dev
```

This ensures:
- `.env.development` is loaded
- Port 3001 is used (from .env.development)
- Database is `agents-dev.db` (not production db)

## Verification Checklist

After starting dev environment, verify:

- [ ] Dev backend on port 3001 (check PID file: `cat backend/data/backend.pid`)
- [ ] Dev frontend on port 5174 (visit http://localhost:5174)
- [ ] Production backend on port 3000 (if running, should be undisturbed)
- [ ] Production frontend on port 5173 (if running, should be undisturbed)
- [ ] Backend unit tests pass (`cd backend && npm test`)
- [ ] Frontend unit tests pass (`cd frontend && npm test -- --run`)
- [ ] E2E tests pass (`cd frontend && npm run test:e2e`)

Use the verification script:
```bash
./scripts/verify-env.sh
```
