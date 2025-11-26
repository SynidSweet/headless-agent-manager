# Documentation Archive

**Historical documentation preserved for reference**

---

## Purpose

This directory contains documentation from earlier phases of the project that is no longer current but may be useful for historical reference or understanding project evolution.

**For current documentation, see**:
- `/CLAUDE.md` - Main AI agent guide
- `/docs/testing/` - Complete testing infrastructure
- `/SPECIFICATION.md` - System specification
- `/README.md` - Project overview

---

## Archived Files

### Historical Reports (Nov 9-18, 2025)

| File | Date | Purpose | Status |
|------|------|---------|--------|
| `MVP_COMPLETION_REPORT.md` | Nov 9 | MVP completion milestone | Historical record |
| `PHASE_1_2_COMPLETION.md` | Nov 9 | Phases 1-2 completion | Historical record |
| `E2E_FINAL_REPORT.md` | Nov 18 | E2E test completion | Historical record |
| `E2E_SUCCESS_SUMMARY.md` | Nov 18 | E2E success metrics | Historical record |
| `COMPREHENSIVE_TEST_STATUS.md` | Nov 18 | Test status snapshot | Historical record |

### Discovery Documents (Nov 9, 2025)

| File | Date | Purpose | Status |
|------|------|---------|--------|
| `CRITICAL_DISCOVERY_CLAUDE_CLI.md` | Nov 9 | Claude CLI investigation | Information incorporated into CLAUDE.md |

### Superseded Documentation (Nov 9-18, 2025)

| File | Date | Superseded By | Reason |
|------|------|---------------|--------|
| `E2E_TESTING_INSTRUCTIONS.md` | Nov 18 | `/docs/testing/` | Replaced by comprehensive testing docs |
| `testing-guide.md` | Earlier | `/docs/testing/TESTING_ARCHITECTURE_GUIDE.md` | Replaced by comprehensive guide |

---

## Why These Are Archived

**Not Deleted**: These documents contain valuable historical context and show project evolution.

**Not Current**: Information may be outdated as architecture evolved and new patterns were adopted.

**Reference Only**: Use for understanding project history, not for current development.

---

## For AI Agents

**Do NOT use these documents for development guidance.**

Instead, always refer to:
- `/CLAUDE.md` - Current development guide
- `/docs/testing/` - Current testing methodology
- `/SPECIFICATION.md` - Current architecture specification

---

## Historical Context

### Project Timeline

**Nov 9, 2025**: MVP completed
- All 6 phases implemented
- Clean Architecture + TDD
- 261 backend tests passing

**Nov 18, 2025**: Frontend E2E tests added
- 9 fullstack E2E tests
- Event-driven architecture verified
- 100% E2E pass rate

**Nov 23-24, 2025**: WebSocket refactoring + Testing infrastructure
- Moved to 100% WebSocket-based architecture
- Comprehensive testing documentation created
- 676+ test plan established
- FK constraint bug identified and fixed

---

## Useful Historical Information

### From MVP Completion Report

**Key achievements documented**:
- TDD methodology established
- Clean Architecture implemented
- 100% domain layer coverage achieved
- Real-time streaming working

### From E2E Reports

**Test patterns established**:
- Synthetic agents for deterministic testing
- Fullstack integration test approach
- Event-driven architecture verification
- Gap detection validation

### From Discovery Documents

**Technical findings**:
- Claude CLI --output-format stream-json
- Python proxy solution for Max subscription
- Node.js bug blocking ClaudeCodeAdapter

**All this information is now incorporated into current documentation.**

---

**Archived**: 2025-11-24
**Reason**: Superseded by comprehensive testing infrastructure documentation
**Retention**: Permanent (historical record)
