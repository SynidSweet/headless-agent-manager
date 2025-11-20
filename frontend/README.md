# Headless AI Agent Manager - Frontend

React-based frontend for managing multiple concurrent headless AI agents with real-time output streaming.

**Status:** ✅ Production Ready (Nov 2025)
**Test Coverage:** 80.3% components, 100% pass rate (82 tests)

---

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:5173
```

### Testing

**Unit Tests:**
```bash
npm test              # Watch mode (TDD)
npm test -- --run     # Run once
npm run test:coverage # Coverage report
npm run test:ui       # Interactive UI
```

**E2E Tests (requires backend):**
```bash
# Terminal 1: Start backend
cd ../backend
npm run dev

# Terminal 2: Run E2E tests
npm run test:e2e      # Run all E2E tests
npm run test:e2e:ui   # E2E with UI
```

**Build:**
```bash
npm run build    # Production build
npm run preview  # Preview build
```

---

## Test Infrastructure

### Unit/Integration Tests (Vitest)
- **Framework:** Vitest 1.6.0
- **Testing Library:** @testing-library/react
- **Environment:** jsdom
- **Coverage:** v8

**Test Suites:**
- Infrastructure tests (4 tests)
- Hook tests (20 tests)
- Component tests (39 tests)

**Total:** 63 unit/integration tests

### E2E Tests (Playwright)
- **Framework:** Playwright
- **Browser:** Chromium
- **Integration:** Real backend API + WebSocket

**Features:**
- Backend health check (auto-detects if backend is running)
- Test cleanup (ensures test isolation)
- Robust async handling (waits for actual events, not timeouts)

**Test Suites:**
- Agent lifecycle (5 tests)
- Message display (3 tests)
- Agent switching (3 tests)
- Agent termination (4 tests)
- WebSocket connection (4 tests)

**Total:** 19 E2E tests

**See:** `/E2E_TESTING_GUIDE.md` for complete E2E setup guide

---

## Architecture

### Message State Management
- **Single source of truth:** Database
- **Deduplication:** Message UUIDs
- **Ordering:** Sequence numbers
- **Gap detection:** Automatic refetch on missing sequences
- **Hook:** `useAgentMessages` (87% coverage)

### Design System
- **Tokens:** `useDesignTokens` hook (100% coverage)
- **Colors:** WCAG AA compliant (16.1:1 contrast)
- **Spacing:** Consistent scale (xs→xl)
- **Typography:** System fonts + monospace

### Component Structure
```
src/
├── components/
│   ├── AgentLaunchForm.tsx  (100% coverage)
│   ├── AgentList.tsx        (97.95% coverage)
│   ├── AgentOutput.tsx      (99.04% coverage)
│   └── ErrorBoundary.tsx
├── hooks/
│   ├── useAgentMessages.ts  (87% coverage)
│   ├── useDesignTokens.ts   (100% coverage)
│   └── useWebSocket.ts
├── services/
│   └── api.service.ts
├── types/
│   └── agent.types.ts
└── App.tsx
```

---

## Available Scripts

### Development
- `npm run dev` - Start dev server (port 5173)
- `npm run build` - Production build
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Testing
- `npm test` - Run unit tests (watch mode)
- `npm test -- --run` - Run unit tests once
- `npm run test:ui` - Interactive test UI
- `npm run test:coverage` - Coverage report
- `npm run test:e2e` - E2E tests (requires backend)
- `npm run test:e2e:ui` - E2E with UI

---

## Key Features

### Real-Time Agent Management
- Launch multiple agents concurrently
- Switch between agent outputs
- Terminate running agents
- View message history

### Message Display
- Historical message loading from API
- Real-time WebSocket updates
- Message deduplication by UUID
- Gap detection and filling
- Auto-scroll to latest messages

### Design & UX
- WCAG AA accessible (16.1:1 contrast)
- Responsive design
- Graceful error handling
- Loading states
- Connection status indicator

---

## Environment Variables

Create a `.env` file:

```bash
# API URLs (optional - auto-detected)
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

**Default behavior (no .env needed):**
- Development: Uses `http://localhost:3000`
- Production: Uses `window.location.origin + '/api'`

---

## Tech Stack

- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 4.5** - Build tool
- **Socket.IO Client** - WebSocket connections
- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **React Testing Library** - Component testing

---

## Coverage Targets

**Component Coverage:** ✅ 80.3% (exceeded 80% target)
- AgentLaunchForm: 100%
- AgentList: 97.95%
- AgentOutput: 99.04%

**Hooks:** 61.41%
- useDesignTokens: 100%
- useAgentMessages: 87%

**Overall:** 59.04%

---

## Documentation

- **E2E Testing Guide:** `/E2E_TESTING_GUIDE.md`
- **Implementation Details:** `/IMPLEMENTATION_BRIEF.md`
- **Architecture:** `/MESSAGE_STATE_ARCHITECTURE.md`
- **User Stories:** `/USER_STORIES.md`
- **Main Project Docs:** `/CLAUDE.md`

---

## Development Workflow

**1. Start backend (required):**
```bash
cd ../backend
npm run dev
```

**2. Start frontend:**
```bash
npm run dev
```

**3. Run tests:**
```bash
# Unit tests
npm test

# E2E tests (backend must be running)
npm run test:e2e
```

**4. Build:**
```bash
npm run build
```

---

## TDD Workflow

This project follows **strict TDD**:

1. **Write test first** (RED)
2. **Implement to pass** (GREEN)
3. **Refactor** (REFACTOR)
4. **Repeat**

**All 82 frontend tests were written before implementation.**

---

**Last Updated:** 2025-11-10
**Status:** Production Ready
**Tests:** 82/82 passing (100%)
