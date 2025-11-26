# Documentation Index

**Complete guide to all project documentation**

Last Updated: 2025-11-24

---

## 🚀 Quick Start for AI Agents

**New to this project?** Read in this order:

1. **[README.md](./README.md)** (5 min) - Project overview and quick start
2. **[CLAUDE.md](./CLAUDE.md)** (30 min) - Main AI development guide
3. **[docs/testing/README.md](./docs/testing/README.md)** (15 min) - Testing infrastructure guide
4. **[SPECIFICATION.md](./SPECIFICATION.md)** (45 min) - Complete system specification

**Total onboarding time**: ~1.5 hours

---

## 📚 Documentation Structure

```
/
├── README.md                    # Project overview
├── CLAUDE.md                    # AI agent development guide ⭐
├── SPECIFICATION.md             # System specification
├── PYTHON_PROXY_SOLUTION.md     # Claude Max subscription setup
│
├── docs/
│   ├── architecture.md          # Architecture details
│   ├── api-reference.md         # API documentation
│   ├── setup-guide.md           # Setup instructions
│   │
│   ├── testing/                 # Testing infrastructure ⭐
│   │   ├── README.md                           # Testing guide index
│   │   ├── TESTING_ARCHITECTURE_GUIDE.md       # Philosophy & rules
│   │   ├── COMPREHENSIVE_TEST_PLAN.md          # 232 tests to implement
│   │   ├── TEST_TEMPLATES.md                   # Copy-paste templates
│   │   ├── TEST_HELPER_LIBRARY.md              # Utility specs
│   │   └── IMPLEMENTATION_SUMMARY.md           # Overview
│   │
│   └── archive/                 # Historical documents
│       ├── README.md                           # Archive index
│       ├── MVP_COMPLETION_REPORT.md            # Nov 9 milestone
│       ├── PHASE_1_2_COMPLETION.md             # Nov 9 milestone
│       ├── E2E_FINAL_REPORT.md                 # Nov 18 milestone
│       ├── E2E_SUCCESS_SUMMARY.md              # Nov 18 metrics
│       ├── COMPREHENSIVE_TEST_STATUS.md        # Nov 18 snapshot
│       ├── CRITICAL_DISCOVERY_CLAUDE_CLI.md    # Nov 9 discovery
│       └── testing-guide.md                    # Superseded
│
├── backend/
│   ├── ARCHITECTURE_AUDIT_FK_BUG.md            # Case study: FK bug
│   └── test/e2e/smoke/README.md                # Smoke test guide
│
├── frontend/
│   ├── README.md                # Frontend overview
│   └── e2e/fullstack/README.md  # Fullstack E2E guide
│
└── claude-proxy-service/
    └── README.md                # Python proxy service guide
```

---

## 📖 Documentation by Purpose

### For Development (Read These)

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **CLAUDE.md** | Main development guide | Before any coding |
| **docs/testing/** | Complete testing infrastructure | Before writing tests |
| **SPECIFICATION.md** | System design & requirements | Understanding system |
| **docs/architecture.md** | Layer structure & patterns | Understanding architecture |
| **docs/api-reference.md** | HTTP & WebSocket APIs | Implementing API clients |

### For Setup & Deployment

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **README.md** | Quick start guide | First time setup |
| **docs/setup-guide.md** | Detailed setup | Troubleshooting setup |
| **PYTHON_PROXY_SOLUTION.md** | Claude Max setup | Setting up proxy |
| **claude-proxy-service/README.md** | Proxy service details | Proxy troubleshooting |

### For Testing

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **docs/testing/README.md** | Testing guide index | Starting test work |
| **docs/testing/TESTING_ARCHITECTURE_GUIDE.md** | Philosophy & rules | Understanding testing approach |
| **docs/testing/COMPREHENSIVE_TEST_PLAN.md** | Implementation plan | Planning test work |
| **docs/testing/TEST_TEMPLATES.md** | Code templates | Writing tests |
| **docs/testing/TEST_HELPER_LIBRARY.md** | Utility functions | Using test helpers |
| **backend/test/e2e/smoke/README.md** | Smoke tests | Running real CLI tests |

### For Understanding Issues

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **backend/ARCHITECTURE_AUDIT_FK_BUG.md** | FK constraint bug analysis | Understanding testing gaps |
| **docs/archive/** | Historical milestones | Understanding evolution |

### For Reference

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **frontend/README.md** | Frontend architecture | Frontend development |
| **frontend/e2e/fullstack/README.md** | Fullstack E2E | Writing E2E tests |

---

## 🎯 Documentation by Role

### I'm an AI Agent Implementing Features

**Read**:
1. CLAUDE.md - Development guide
2. docs/testing/README.md - Testing guide
3. SPECIFICATION.md - System design
4. docs/testing/TEST_TEMPLATES.md - When writing tests

**Reference**:
- docs/architecture.md - Layer structure
- docs/api-reference.md - API contracts

### I'm an AI Agent Writing Tests

**Read**:
1. docs/testing/TESTING_ARCHITECTURE_GUIDE.md - Philosophy
2. docs/testing/COMPREHENSIVE_TEST_PLAN.md - What to implement
3. docs/testing/TEST_TEMPLATES.md - How to write them
4. docs/testing/TEST_HELPER_LIBRARY.md - Available utilities

**Reference**:
- backend/ARCHITECTURE_AUDIT_FK_BUG.md - Real bug example

### I'm an AI Agent Fixing Bugs

**Read**:
1. CLAUDE.md - TDD workflow
2. docs/testing/TESTING_ARCHITECTURE_GUIDE.md - Test-first debugging
3. backend/ARCHITECTURE_AUDIT_FK_BUG.md - Case study

**Reference**:
- docs/architecture.md - System structure
- SPECIFICATION.md - Expected behavior

### I'm Setting Up the Environment

**Read**:
1. README.md - Quick start
2. docs/setup-guide.md - Detailed setup
3. PYTHON_PROXY_SOLUTION.md - Proxy configuration

---

## 📊 Documentation Statistics

**Total Pages**: ~200 pages
- Testing Infrastructure: 108 pages
- System Specification: 45 pages
- Architecture Docs: 30 pages
- Setup Guides: 15 pages
- Historical Archive: 50+ pages

**Core Documents**: 8 files (actively maintained)
**Archived Documents**: 8 files (historical reference)
**Total Documentation Files**: 25+ files (excluding vendor docs)

---

## 🔄 Documentation Maintenance

### When to Update Documentation

**Update CLAUDE.md** when:
- Development workflow changes
- New testing rules added
- New tools/technologies added
- Common pitfalls discovered

**Update docs/testing/** when:
- New test patterns discovered
- Test plan progress made
- New helpers implemented
- Testing strategy evolves

**Update SPECIFICATION.md** when:
- Requirements change
- Architecture evolves
- New features added
- Technology stack changes

**Update docs/architecture.md** when:
- Layer structure changes
- New components added
- Design patterns change

**Update docs/api-reference.md** when:
- API endpoints added/changed
- WebSocket events modified
- DTOs updated

### Archival Policy

**Archive when**:
- Document represents a completed milestone
- Information is incorporated into current docs
- Document is superseded by newer version

**Never delete**:
- Keep as historical record
- Shows project evolution
- Helps understand decisions

---

## 🎓 Learning Path for AI Agents

### Level 1: Project Understanding (2 hours)

**Goal**: Understand what the system does

1. README.md (5 min)
2. SPECIFICATION.md - High-level design (20 min)
3. docs/architecture.md - Layer structure (30 min)
4. CLAUDE.md - Skim for overview (15 min)
5. Run the system locally (30 min)
6. Explore codebase (30 min)

**Checkpoint**: Can you explain the system architecture to another AI agent?

### Level 2: Development Readiness (2 hours)

**Goal**: Ready to implement features

1. CLAUDE.md - Deep read (45 min)
2. docs/testing/TESTING_ARCHITECTURE_GUIDE.md (30 min)
3. docs/testing/TEST_TEMPLATES.md - Skim (15 min)
4. Try implementing a simple feature with TDD (30 min)

**Checkpoint**: Can you implement a feature following TDD workflow?

### Level 3: Test Infrastructure Mastery (2 hours)

**Goal**: Ready to implement comprehensive tests

1. docs/testing/README.md (15 min)
2. docs/testing/COMPREHENSIVE_TEST_PLAN.md (30 min)
3. docs/testing/TEST_HELPER_LIBRARY.md (20 min)
4. backend/ARCHITECTURE_AUDIT_FK_BUG.md (15 min)
5. Implement a contract test (40 min)

**Checkpoint**: Can you write contract tests that verify layer boundaries?

### Level 4: Autonomous Development (1 hour)

**Goal**: Full autonomy

1. Review all core principles
2. Implement a feature end-to-end with full test coverage
3. Verify all tests pass
4. Document any new patterns discovered

**Checkpoint**: Can you develop features without human guidance?

---

## 🎯 Documentation Quality Standards

### All Documentation Must

- [ ] Have clear purpose statement at top
- [ ] Include "Last Updated" date
- [ ] Use consistent formatting (markdown)
- [ ] Include code examples where relevant
- [ ] Be organized with clear sections
- [ ] Link to related documents
- [ ] Be maintained by AI agents
- [ ] Be version controlled in git

### Technical Documentation Must Also

- [ ] Include working code examples
- [ ] Show both correct and incorrect patterns
- [ ] Explain WHY not just WHAT
- [ ] Include troubleshooting section
- [ ] Have up-to-date commands/paths

---

## 🔍 Finding Information

### "How do I...?"

| Question | Document | Section |
|----------|----------|---------|
| ...set up the project? | README.md | Quick Start |
| ...run tests? | README.md | Testing |
| ...write a new feature? | CLAUDE.md | Development Workflow |
| ...write tests? | docs/testing/README.md | Quick Start |
| ...understand architecture? | docs/architecture.md | All |
| ...use the API? | docs/api-reference.md | All |
| ...configure Claude adapter? | CLAUDE.md | Claude Adapter Selection |
| ...debug a test failure? | docs/testing/TESTING_ARCHITECTURE_GUIDE.md | Common Pitfalls |
| ...implement contract test? | docs/testing/TEST_TEMPLATES.md | Contract Test templates |
| ...find test helpers? | docs/testing/TEST_HELPER_LIBRARY.md | All |

### "Where is information about...?"

| Topic | Document |
|-------|----------|
| Clean Architecture principles | CLAUDE.md, docs/architecture.md |
| TDD methodology | CLAUDE.md, docs/testing/ |
| WebSocket events | docs/api-reference.md |
| Database schema | backend/src/infrastructure/database/schema.sql |
| Message persistence | CLAUDE.md (Frontend Refactoring section) |
| FK constraint bug | backend/ARCHITECTURE_AUDIT_FK_BUG.md |
| Historical milestones | docs/archive/ |

---

## 🗂️ Recently Updated

| Date | Document | Changes |
|------|----------|---------|
| 2025-11-24 | CLAUDE.md | Added testing infrastructure references |
| 2025-11-24 | README.md | Updated test counts, added testing section |
| 2025-11-23 | docs/testing/* | Created complete testing infrastructure (6 files) |
| 2025-11-23 | backend/ARCHITECTURE_AUDIT_FK_BUG.md | FK bug analysis |
| 2025-11-24 | docs/archive/* | Moved 8 historical documents |

---

## ✅ Documentation Audit Complete

**Cleaned Up**:
- ✅ Archived 8 outdated historical reports
- ✅ Updated README.md with current info
- ✅ Updated CLAUDE.md with testing refs
- ✅ Created archive README explaining archived docs
- ✅ Created this index

**Current State**:
- ✅ All active documentation is up-to-date (Nov 23-24)
- ✅ No contradictions between documents
- ✅ Clear structure and navigation
- ✅ Historical documents preserved in archive
- ✅ AI agents have clear starting points

**Documentation is now ready for AI-autonomous development!**

---

**Maintained By**: AI Agents
**Last Audit**: 2025-11-24
**Next Audit**: When major architecture changes occur
