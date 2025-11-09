# Headless AI Agent Management System

A production-ready system for orchestrating multiple headless AI agents with real-time streaming, persistent storage, and a modern web interface.

## Features

- 🤖 **Multi-Agent Orchestration** - Run multiple Claude Code and Gemini CLI agents concurrently
- ⚡ **Real-time Streaming** - WebSocket-based live output streaming
- 💾 **Persistent Storage** - SQLite database for session history
- 🏗️ **Clean Architecture** - 4-layer hexagonal architecture with dependency injection
- ✅ **Comprehensive Testing** - 270+ tests with high coverage
- 🎨 **Modern UI** - React frontend with real-time updates
- 🔌 **Multiple Claude Adapters** - Choose between Python proxy (Max subscription) or SDK (API key)

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

```bash
cd backend
npm test                 # All tests (270+ passing)
npm run test:watch       # TDD watch mode
npm run test:coverage    # Coverage report
```

## Documentation

- [SPECIFICATION.md](./SPECIFICATION.md) - Complete system specification
- [CLAUDE.md](./CLAUDE.md) - AI development context
- [docs/architecture.md](./docs/architecture.md) - Architecture details
- [docs/testing-guide.md](./docs/testing-guide.md) - TDD practices

## License

MIT
