# Token Streaming Architecture - Complete Documentation Index

## Overview

This directory contains comprehensive architectural documentation for the token streaming system that powers real-time agent output from backend to frontend.

**Documentation Status**: Complete (2025-11-28)
**Total Lines**: 2,248 lines across 3 documents
**Coverage**: Backend, Frontend, Database, Deployment, Testing, Reusability

---

## Documents

### 1. TOKEN_STREAMING_ARCHITECTURE.md (1,239 lines)
**Purpose**: Complete technical specification

**Contents**:
- Layer-by-layer architecture (7 layers)
- Python Proxy Service (message source)
- Infrastructure Adapter Layer (parsing & event filtering)
- Application Service Layer (persistence & broadcasting)
- Presentation Layer (REST API & WebSocket)
- Frontend Hook (message state management)
- UI Components (rendering & interaction)
- Complete message flow diagram
- Database schema with constraints
- Message type taxonomy
- Key architectural decisions explained
- Error handling patterns
- Performance characteristics
- Reusability patterns for other projects
- Generic adapter & parser templates
- Testing strategy (unit/integration/E2E)
- Migration path (token aggregation)
- Troubleshooting guide

**Best For**: 
- Understanding every detail of the system
- Implementing similar systems
- Debugging complex issues
- Code review discussions

**Start Here If**: You're new to the project and want comprehensive understanding

---

### 2. ARCHITECTURE_SUMMARY.md (293 lines)
**Purpose**: Quick reference guide

**Contents**:
- 7-Layer visual stack diagram
- 4 Critical design patterns
- Message lifecycle (streaming → completion → reconnect)
- Key files quick reference table
- Database structure overview
- Event types throughout pipeline
- Error handling matrix
- Performance characteristics table
- Testing strategy breakdown
- Extending to other agents (template)
- 7 Key insights summarized
- When this pattern shines (use cases)
- Production checklist

**Best For**:
- Quick lookups during development
- Onboarding new developers
- Understanding patterns at a glance
- Decision making

**Start Here If**: You need to understand the system quickly (30 minutes)

---

### 3. ARCHITECTURE_DIAGRAMS.md (716 lines)
**Purpose**: Visual representations

**Contents**:
1. **Complete System Architecture** (detailed ASCII diagram)
   - All 7 layers with full implementation details
   - Component responsibilities
   - Data flow arrows
   - Technology stack

2. **Message Flow Timeline** (T0-T8)
   - Real-time message arrival sequence
   - Parser decisions at each step
   - Database operations
   - WebSocket events
   - Frontend rendering updates

3. **Gap Detection and Filling** (visual flow)
   - Sequence number mismatch detection
   - API call to fetch missing messages
   - Merge and deduplication logic
   - State update

4. **Error Scenarios** (3 examples)
   - Foreign key constraint failure
   - WebSocket disconnection handling
   - Out-of-order message handling

5. **Database Transaction Flow**
   - Atomic INSERT with subquery
   - Foreign key constraint checking
   - Unique constraint enforcement
   - Transaction lifecycle

6. **REST vs WebSocket Message Flow**
   - Initial load via REST
   - Real-time updates via WebSocket
   - Gap filling via REST

7. **Deployment Architecture**
   - Development setup (3 services)
   - Production setup (Docker)

**Best For**:
- Visual learners
- Presentations
- Understanding data flow
- Identifying bottlenecks

**Start Here If**: You're more visual than textual

---

## Quick Navigation

### By Role

**Backend Developer**:
1. Start: ARCHITECTURE_SUMMARY.md (understand patterns)
2. Dive Deep: TOKEN_STREAMING_ARCHITECTURE.md §1.2-1.3 (Adapter & Service Layer)
3. Reference: ARCHITECTURE_DIAGRAMS.md §5-6 (DB transactions & REST/WebSocket)

**Frontend Developer**:
1. Start: ARCHITECTURE_SUMMARY.md (understand patterns)
2. Dive Deep: TOKEN_STREAMING_ARCHITECTURE.md §1.6-1.7 (Hook & UI)
3. Reference: ARCHITECTURE_DIAGRAMS.md §2-3 (Message flow & gap detection)

**DevOps/Infrastructure**:
1. Start: ARCHITECTURE_SUMMARY.md (understand layers)
2. Dive Deep: TOKEN_STREAMING_ARCHITECTURE.md §1.1 (Python Proxy)
3. Reference: ARCHITECTURE_DIAGRAMS.md §7 (Deployment)

**New Team Member**:
1. Read: ARCHITECTURE_SUMMARY.md (30 min)
2. Skim: TOKEN_STREAMING_ARCHITECTURE.md (60 min)
3. Refer: ARCHITECTURE_DIAGRAMS.md (as needed)

**Project Lead/Architect**:
1. Read: TOKEN_STREAMING_ARCHITECTURE.md (complete understanding)
2. Reference: ARCHITECTURE_SUMMARY.md (decisions at a glance)
3. Use: ARCHITECTURE_DIAGRAMS.md (presentations & decisions)

---

### By Topic

**Message Persistence**
- TOKEN_STREAMING_ARCHITECTURE.md §1.2 (Parser)
- TOKEN_STREAMING_ARCHITECTURE.md §1.3 (Streaming Service & Message Service)
- TOKEN_STREAMING_ARCHITECTURE.md §3 (Database Schema)
- ARCHITECTURE_DIAGRAMS.md §5 (Transaction Flow)

**Real-Time Streaming**
- TOKEN_STREAMING_ARCHITECTURE.md §1.1 (Python Proxy)
- TOKEN_STREAMING_ARCHITECTURE.md §1.5 (WebSocket Gateway)
- ARCHITECTURE_DIAGRAMS.md §2 (Message Flow Timeline)
- ARCHITECTURE_DIAGRAMS.md §6 (REST vs WebSocket)

**Error Handling & Resilience**
- TOKEN_STREAMING_ARCHITECTURE.md §6 (Error Handling)
- ARCHITECTURE_SUMMARY.md (Error Handling Matrix)
- ARCHITECTURE_DIAGRAMS.md §4 (Error Scenarios)

**Database Design**
- TOKEN_STREAMING_ARCHITECTURE.md §3 (Schema)
- TOKEN_STREAMING_ARCHITECTURE.md §5.1 (Decision: Database as Truth)
- TOKEN_STREAMING_ARCHITECTURE.md §5.2 (Decision: UUID + Sequence)
- ARCHITECTURE_DIAGRAMS.md §5 (Transaction Flow)

**Frontend Implementation**
- TOKEN_STREAMING_ARCHITECTURE.md §1.6 (useAgentMessages Hook)
- TOKEN_STREAMING_ARCHITECTURE.md §1.7 (AgentOutput Component)
- ARCHITECTURE_DIAGRAMS.md §2 (Message Flow)
- ARCHITECTURE_DIAGRAMS.md §3 (Gap Detection)

**Testing**
- TOKEN_STREAMING_ARCHITECTURE.md §9 (Testing Strategy)
- ARCHITECTURE_SUMMARY.md (Testing Strategy Breakdown)

**Extending System**
- TOKEN_STREAMING_ARCHITECTURE.md §8 (Reusability Patterns)
- ARCHITECTURE_SUMMARY.md (Extending to Other Agents)

---

## Key Concepts

### The 4 Design Patterns

1. **Save-First, Emit-Second** (§5.1)
   - Database is source of truth
   - WebSocket is notification mechanism
   - Ensures no data loss

2. **UUID + Sequence Number** (§5.2)
   - UUID for deduplication across network retries
   - Sequence number for ordering and gap detection
   - Together provide idempotency

3. **Parser Returns Null** (§5.3)
   - Skip non-displayable events silently
   - Cleaner control flow
   - No log pollution

4. **Gap Detection & Filling** (§5.4)
   - REST API for bulk retrieval
   - WebSocket for real-time
   - Hybrid approach combines benefits

---

## Critical Files to Know

| File | Purpose | Read If |
|------|---------|---------|
| `claude-python-proxy.adapter.ts` | Fetch SSE stream | Implementing new adapter |
| `claude-message.parser.ts` | Parse JSONL | Changing message formats |
| `streaming.service.ts` | Persist + broadcast | Changing flow order |
| `agent-message.service.ts` | Save/load messages | DB queries failing |
| `agent.controller.ts` | REST endpoints | API issues |
| `agent.gateway.ts` | WebSocket events | Real-time issues |
| `useAgentMessages.ts` | Message state mgmt | Frontend bugs |
| `AgentOutput.tsx` | UI rendering | Display issues |
| `schema.sql` | Database schema | FK/sequence issues |

---

## Common Questions Answered

### Q: Why do we need both UUID and sequence number?
A: TOKEN_STREAMING_ARCHITECTURE.md §5.2
- UUID: Handles duplicate messages from network retries
- Sequence: Enables gap detection and ordering
- Together: Idempotency without consensus

### Q: What happens if WebSocket is unavailable?
A: TOKEN_STREAMING_ARCHITECTURE.md §6.2 + ARCHITECTURE_DIAGRAMS.md §4
- Broadcast fails but agent continues
- Frontend can reconnect and fetch history via REST
- Gap detection fills missing messages

### Q: Why does parser return null?
A: TOKEN_STREAMING_ARCHITECTURE.md §5.3
- Events like `message_start` have no displayable content
- Returning null allows adapter to skip silently
- Cleaner control flow than throwing errors

### Q: How does the system handle network interruptions?
A: ARCHITECTURE_DIAGRAMS.md §3
- Gap detection via sequence numbers
- REST API call to fetch missing messages
- Deduplication by UUID
- Re-sort by sequence number

### Q: How can I extend this to other AI services?
A: TOKEN_STREAMING_ARCHITECTURE.md §8
- Create new adapter (mirrors ClaudePythonProxyAdapter)
- Create new parser (mirrors ClaudeMessageParser)
- Update AgentFactory
- Rest of system works unchanged

---

## Implementation Checklist

When implementing a new feature:

1. Read relevant section in TOKEN_STREAMING_ARCHITECTURE.md
2. Check ARCHITECTURE_SUMMARY.md for quick patterns
3. Use ARCHITECTURE_DIAGRAMS.md to trace data flow
4. Verify error handling is covered (§6 or DIAGRAMS §4)
5. Add tests following §9 Testing Strategy
6. Update relevant documentation

---

## Debugging Guide

**Messages not appearing in frontend?**
1. Check: ARCHITECTURE_DIAGRAMS.md §6 (REST vs WebSocket)
2. Verify: useAgentMessages hook is receiving events
3. Check: Deduplication isn't filtering message

**Messages appearing twice?**
1. Check: useAgentMessages §deduplication (messageIdsRef)
2. Verify: UUID is unique

**Messages out of order?**
1. Check: Sequence number gap detection (§3)
2. Verify: Re-sort after gap filling

**WebSocket messages not appearing?**
1. Check: StreamingService.broadcastMessage (§1.3)
2. Verify: Agent room subscription

**Database errors?**
1. Check: ARCHITECTURE_DIAGRAMS.md §5 (Transaction Flow)
2. Verify: FK constraints enabled
3. Check: Sequence number uniqueness

---

## Performance Tuning

See TOKEN_STREAMING_ARCHITECTURE.md §7 for:
- Message insertion: O(1) amortized
- Message retrieval: O(n) for all, O(m) for since query
- Gap filling: Single HTTP roundtrip + merge
- Database indexes for fast queries

---

## Production Deployment

See ARCHITECTURE_SUMMARY.md Production Checklist:
- FK constraints enabled
- Sequence number uniqueness constraint
- Proper database indexes
- Error handling doesn't crash system
- WebSocket rooms for isolation
- UUID v4 for uniqueness
- DELETE journal mode for safety

---

## Version History

- **2025-11-28**: Initial documentation created
  - TOKEN_STREAMING_ARCHITECTURE.md: Complete spec (1,239 lines)
  - ARCHITECTURE_SUMMARY.md: Quick reference (293 lines)
  - ARCHITECTURE_DIAGRAMS.md: Visual guide (716 lines)

---

## Related Documentation

- `/SPECIFICATION.md` - System design at high level
- `/E2E_TESTING_GUIDE.md` - End-to-end testing details
- `/MESSAGE_STATE_ARCHITECTURE.md` - Message state design
- `/docs/architecture/` - Additional architecture docs

---

## Contact & Questions

For clarifications or updates to this documentation:
1. Check if question is answered in relevant section
2. Refer to the specific code files mentioned
3. Check recent commits for context
4. Update documentation if new patterns discovered

---

**Documentation Last Updated**: 2025-11-28
**Architecture Status**: Production Ready
**Test Coverage**: 343+ tests, 80.3% component coverage
