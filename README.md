# Headless AI Agent Management System

A production-ready system for orchestrating multiple headless AI agents with real-time streaming, persistent storage, and a modern web interface.

## Features

- 🤖 **Multi-Agent Orchestration** - Run multiple Claude Code and Gemini CLI agents concurrently
- ⚡ **Real-time Streaming** - 100% WebSocket-based event-driven architecture
- 💾 **Persistent Storage** - SQLite database with FK constraints and message deduplication
- 🏗️ **Clean Architecture** - 4-layer hexagonal architecture with dependency injection
- ✅ **Comprehensive Testing** - 444+ tests with production-grade coverage (676+ planned)
- 🎨 **Modern UI** - React + Redux frontend with real-time updates and debug tools
- 🔌 **Multiple Claude Adapters** - Choose between Python proxy (Max subscription) or SDK (API key)
- 📊 **AI-Autonomous Development** - Complete test infrastructure for AI agents

## Quick Start

### Prerequisites

- Node.js 18+ (backend and frontend)
- Python 3.9+ (for Claude proxy service)
- npm or pnpm

### Installation

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Install frontend dependencies  
cd ../frontend
npm install

# 3. Setup Python proxy (for Claude Max subscription)
cd ../claude-proxy-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Configuration

```bash
# Backend configuration
cd backend
cp .env.example .env

# Edit .env and configure:
# - REPOSITORY_TYPE=sqlite or memory
# - DATABASE_PATH=./data/agents.db
# - CLAUDE_ADAPTER=python-proxy or sdk
```

### Running the System

**Option 1: Automated (Recommended)**
```bash
./start-all.sh
```

**Option 2: Manual (3 separate terminals)**

```bash
# Terminal 1: Python Proxy
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

Access the application at: **http://localhost:5173**

### Stopping the System

```bash
./stop-all.sh
```

## Testing

### Backend Tests
```bash
cd backend
npm test                 # All tests (370 passing, 676+ planned)
npm run test:watch       # TDD watch mode
npm run test:coverage    # Coverage report
npm run test:integration # Integration tests only
npm run test:e2e         # E2E tests
npm run test:smoke       # Smoke tests with real CLI
```

### Frontend Tests
```bash
cd frontend
npm test                 # Unit tests (74 passing)
npm test -- --run        # Run once (no watch)
npm run test:e2e         # E2E tests (requires backend running)
npm run test:coverage    # Coverage report
```

### Full Test Suite
```bash
# Run all tests across the system
npm test  # In backend
cd ../frontend && npm test -- --run
cd ../frontend && npm run test:e2e  # With backend running
```

## Documentation

### For AI Agents (Start Here)
- **[CLAUDE.md](./CLAUDE.md)** - Main AI development guide with testing rules
- **[docs/testing/](./docs/testing/)** - Complete testing infrastructure (108 pages)
  - Start with [docs/testing/README.md](./docs/testing/README.md)

### System Documentation
- [SPECIFICATION.md](./SPECIFICATION.md) - Complete system specification
- [docs/architecture.md](./docs/architecture.md) - Architecture details
- [docs/api-reference.md](./docs/api-reference.md) - API documentation
- [docs/setup-guide.md](./docs/setup-guide.md) - Setup instructions

### Historical (Archive)
- [docs/archive/](./docs/archive/) - Historical reports and superseded documentation

## License

MIT
