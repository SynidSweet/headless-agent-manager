# Test Templates for AI Agents

**Ready-to-use templates for all test types**

---

## How to Use These Templates

1. **Copy the appropriate template** based on what you're testing
2. **Replace placeholders** (ComponentName, FeatureName, etc.)
3. **Fill in test logic** following the TDD workflow
4. **Verify test fails first** (RED)
5. **Implement feature** (GREEN)
6. **Refactor** while keeping tests green

---

## Template Index

- [Unit Test: Domain Entity](#unit-test-domain-entity)
- [Unit Test: Value Object](#unit-test-value-object)
- [Unit Test: Application Service](#unit-test-application-service)
- [Integration Test: Repository + Database](#integration-test-repository--database)
- [Integration Test: Service + Infrastructure](#integration-test-service--infrastructure)
- [Contract Test: Interface Compliance](#contract-test-interface-compliance)
- [Contract Test: Layer Boundary](#contract-test-layer-boundary)
- [E2E Test: User Journey](#e2e-test-user-journey)
- [E2E Test: WebSocket Flow](#e2e-test-websocket-flow)
- [Performance Test](#performance-test)

---

## Unit Test: Domain Entity

```typescript
/**
 * [EntityName] Entity Tests
 *
 * Purpose: Verify [EntityName] business logic and state transitions
 * Layer: Domain
 * Type: Unit
 *
 * Coverage:
 * - Creation with valid/invalid data
 * - State transitions (all valid and invalid combinations)
 * - Invariants maintenance
 * - Edge cases
 *
 * Dependencies: None (pure domain logic)
 * Mocks: None (domain is self-contained)
 */

import { EntityName } from '@domain/entities/entity-name.entity';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('EntityName Entity', () => {
  describe('Creation', () => {
    it('should create entity with valid data', () => {
      // Arrange
      const data = {
        field1: 'valid value',
        field2: 123,
      };

      // Act
      const entity = EntityName.create(data);

      // Assert
      expect(entity).toBeDefined();
      expect(entity.field1).toBe('valid value');
      expect(entity.field2).toBe(123);
      expect(entity.id).toBeDefined(); // Auto-generated ID
    });

    it('should reject creation with invalid data', () => {
      // Arrange
      const invalidData = {
        field1: '', // Invalid: empty
        field2: -1, // Invalid: negative
      };

      // Act & Assert
      expect(() => EntityName.create(invalidData))
        .toThrow(DomainException);
      expect(() => EntityName.create(invalidData))
        .toThrow('field1 cannot be empty');
    });

    it('should validate required fields', () => {
      expect(() => EntityName.create({ field1: null }))
        .toThrow('field1 is required');
    });
  });

  describe('State Transitions', () => {
    let entity: EntityName;

    beforeEach(() => {
      entity = EntityName.create({
        field1: 'test',
        field2: 123,
      });
    });

    describe('Valid Transitions', () => {
      it('should allow STATE_A → STATE_B transition', () => {
        // Arrange
        expect(entity.state).toBe(State.STATE_A);

        // Act
        entity.transitionToStateB();

        // Assert
        expect(entity.state).toBe(State.STATE_B);
        expect(entity.transitionedAt).toBeDefined();
      });

      it('should allow STATE_B → STATE_C transition', () => {
        entity.transitionToStateB();

        entity.transitionToStateC();

        expect(entity.state).toBe(State.STATE_C);
      });
    });

    describe('Invalid Transitions', () => {
      it('should reject STATE_A → STATE_C transition (must go through B)', () => {
        expect(() => entity.transitionToStateC())
          .toThrow('Cannot transition from STATE_A to STATE_C');
      });

      it('should reject STATE_C → STATE_A transition (no backwards)', () => {
        entity.transitionToStateB();
        entity.transitionToStateC();

        expect(() => entity.transitionToStateA())
          .toThrow('Cannot transition backwards');
      });
    });
  });

  describe('Invariants', () => {
    it('should maintain invariant: field2 always positive', () => {
      const entity = EntityName.create({ field1: 'test', field2: 5 });

      entity.decrementField2();
      expect(entity.field2).toBeGreaterThan(0);

      // Try to violate invariant
      entity.decrementField2();
      entity.decrementField2();
      entity.decrementField2();
      entity.decrementField2();

      // Should never go below 0
      expect(entity.field2).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum valid values', () => {
      const entity = EntityName.create({
        field1: 'a', // Minimum length
        field2: 0,   // Minimum value
      });

      expect(entity).toBeDefined();
    });

    it('should handle maximum valid values', () => {
      const entity = EntityName.create({
        field1: 'a'.repeat(1000), // Maximum length
        field2: Number.MAX_SAFE_INTEGER,
      });

      expect(entity).toBeDefined();
    });
  });
});
```

---

## Unit Test: Value Object

```typescript
/**
 * [ValueObjectName] Value Object Tests
 *
 * Purpose: Verify immutability and validation rules
 * Layer: Domain
 * Type: Unit
 */

import { ValueObjectName } from '@domain/value-objects/value-object-name.vo';

describe('ValueObjectName Value Object', () => {
  describe('Creation', () => {
    it('should create from valid value', () => {
      const vo = ValueObjectName.create('valid-value');

      expect(vo.value).toBe('valid-value');
    });

    it('should reject invalid format', () => {
      expect(() => ValueObjectName.create('INVALID'))
        .toThrow('Value must match pattern: [a-z-]+');
    });
  });

  describe('Equality', () => {
    it('should consider two VOs with same value as equal', () => {
      const vo1 = ValueObjectName.create('test');
      const vo2 = ValueObjectName.create('test');

      expect(vo1.equals(vo2)).toBe(true);
    });

    it('should consider VOs with different values as not equal', () => {
      const vo1 = ValueObjectName.create('test1');
      const vo2 = ValueObjectName.create('test2');

      expect(vo1.equals(vo2)).toBe(false);
    });
  });

  describe('Immutability', () => {
    it('should not allow value mutation', () => {
      const vo = ValueObjectName.create('test');

      // Value objects should be immutable
      expect(() => {
        (vo as any).value = 'changed';
      }).toThrow(); // Or verify value didn't change
    });
  });

  describe('String Representation', () => {
    it('should convert to string', () => {
      const vo = ValueObjectName.create('test-value');

      expect(vo.toString()).toBe('test-value');
    });
  });
});
```

---

## Unit Test: Application Service

```typescript
/**
 * [ServiceName] Service Tests
 *
 * Purpose: Verify service orchestration logic
 * Layer: Application
 * Type: Unit
 *
 * Mocks: Ports/interfaces (IRepository, IAdapter, etc.)
 * Real: Domain entities, value objects
 */

import { ServiceName } from '@application/services/service-name.service';
import { IPort } from '@application/ports/port.port';

describe('ServiceName', () => {
  let service: ServiceName;
  let mockPort: jest.Mocked<IPort>;

  beforeEach(() => {
    mockPort = {
      method1: jest.fn(),
      method2: jest.fn(),
    } as any;

    service = new ServiceName(mockPort);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature: Business Logic X', () => {
    it('should coordinate dependencies correctly', async () => {
      // Arrange
      const input = { field: 'value' };
      mockPort.method1.mockResolvedValue({ result: 'success' });

      // Act
      const result = await service.doSomething(input);

      // Assert
      expect(mockPort.method1).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'value' })
      );
      expect(result).toBeDefined();
    });

    it('should handle port failure gracefully', async () => {
      // Arrange
      const error = new Error('Port unavailable');
      mockPort.method1.mockRejectedValue(error);

      // Act & Assert
      await expect(service.doSomething({ field: 'value' }))
        .rejects.toThrow('Port unavailable');
    });

    it('should validate input before calling port', async () => {
      // Arrange
      const invalidInput = { field: '' };

      // Act & Assert
      await expect(service.doSomething(invalidInput))
        .rejects.toThrow('field is required');

      // Port should never be called with invalid data
      expect(mockPort.method1).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should propagate domain exceptions', async () => {
      const domainError = new DomainException('Business rule violated');
      mockPort.method1.mockRejectedValue(domainError);

      await expect(service.doSomething({ field: 'value' }))
        .rejects.toThrow(DomainException);
    });

    it('should wrap infrastructure exceptions', async () => {
      const infraError = new Error('Database connection failed');
      mockPort.method1.mockRejectedValue(infraError);

      await expect(service.doSomething({ field: 'value' }))
        .rejects.toThrow('Failed to process request');
    });
  });
});
```

---

## Integration Test: Repository + Database

```typescript
/**
 * [RepositoryName] Integration Tests
 *
 * Purpose: Verify repository works with real database
 * Layer: Infrastructure
 * Type: Integration
 *
 * CRITICAL: Uses REAL database with REAL constraints
 * NO MOCKS - This tests actual database behavior
 */

import { RepositoryName } from '@infrastructure/repositories/repository-name.repository';
import { DatabaseService } from '@infrastructure/database/database.service';
import { Entity } from '@domain/entities/entity.entity';

describe('RepositoryName (Integration)', () => {
  let db: DatabaseService;
  let repository: RepositoryName;

  beforeEach(() => {
    // Create REAL database (in-memory for speed, but real constraints)
    db = new DatabaseService(':memory:');
    db.onModuleInit(); // Runs migrations

    // Verify FK constraints are enabled
    const fk = db.getDatabase().pragma('foreign_keys', { simple: true });
    if (fk !== 1) {
      throw new Error('Foreign keys must be enabled for integration tests');
    }

    repository = new RepositoryName(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('CRUD Operations', () => {
    it('should save and retrieve entity', async () => {
      // Arrange
      const entity = Entity.create({...});

      // Act
      await repository.save(entity);

      // Assert: Retrieve from database
      const retrieved = await repository.findById(entity.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id.toString()).toBe(entity.id.toString());
    });

    it('should update existing entity', async () => {
      const entity = Entity.create({...});
      await repository.save(entity);

      // Modify entity
      entity.updateField('new value');

      // Save again (update)
      await repository.save(entity);

      // Verify update persisted
      const retrieved = await repository.findById(entity.id);
      expect(retrieved!.field).toBe('new value');
    });

    it('should delete entity', async () => {
      const entity = Entity.create({...});
      await repository.save(entity);

      await repository.delete(entity.id);

      const retrieved = await repository.findById(entity.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Query Operations', () => {
    it('should find entities by criteria', async () => {
      const entity1 = Entity.create({ status: 'active' });
      const entity2 = Entity.create({ status: 'inactive' });

      await repository.save(entity1);
      await repository.save(entity2);

      const active = await repository.findByStatus('active');

      expect(active).toHaveLength(1);
      expect(active[0].id.toString()).toBe(entity1.id.toString());
    });

    it('should return empty array when no matches', async () => {
      const results = await repository.findByStatus('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('Constraints', () => {
    it('should enforce unique constraint on ID', async () => {
      const entity1 = Entity.create({...});
      const entity2 = Entity.createWithId(entity1.id, {...}); // Same ID

      await repository.save(entity1);

      await expect(repository.save(entity2))
        .rejects.toThrow(/UNIQUE constraint/);
    });

    it('should enforce foreign key constraints', async () => {
      // Attempt to save child without parent
      const invalidChildData = {
        parentId: 'non-existent-parent',
        data: 'test'
      };

      await expect(repository.saveChild(invalidChildData))
        .rejects.toThrow(/FOREIGN KEY constraint/);
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent saves without race conditions', async () => {
      const entities = Array.from({ length: 100 }, () => Entity.create({...}));

      // Save all concurrently
      await Promise.all(entities.map(e => repository.save(e)));

      // Verify all were saved
      const all = await repository.findAll();
      expect(all).toHaveLength(100);
    });
  });
});
```

---

## Integration Test: Service + Infrastructure

```typescript
/**
 * [ServiceName] Integration Tests
 *
 * Purpose: Verify service works with real infrastructure
 * Layer: Application + Infrastructure
 * Type: Integration
 *
 * Uses REAL: Database, Repository, Adapters
 * Mocks: External APIs only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceName } from '@application/services/service-name.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { RepositoryName } from '@infrastructure/repositories/repository-name.repository';

describe('ServiceName (Integration)', () => {
  let service: ServiceName;
  let db: DatabaseService;
  let repository: RepositoryName;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceName,
        {
          provide: DatabaseService,
          useFactory: () => {
            const database = new DatabaseService(':memory:');
            database.onModuleInit();
            return database;
          },
        },
        RepositoryName,
      ],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
    db = module.get<DatabaseService>(DatabaseService);
    repository = module.get<RepositoryName>(RepositoryName);
  });

  afterEach(() => {
    // Clean database
    db.getDatabase().exec('DELETE FROM table_name');
    db.close();
  });

  describe('Feature X', () => {
    it('should complete full operation with real database', async () => {
      // Act
      const result = await service.doComplexOperation({...});

      // Assert: Verify in database
      const saved = db.getDatabase()
        .prepare('SELECT * FROM table_name WHERE id = ?')
        .get(result.id);

      expect(saved).toBeDefined();
    });

    it('should handle database errors', async () => {
      // Corrupt database or lock it
      db.getDatabase().exec('PRAGMA locking_mode = EXCLUSIVE');
      db.getDatabase().prepare('BEGIN EXCLUSIVE').run();

      // Should fail gracefully
      await expect(service.doComplexOperation({...}))
        .rejects.toThrow(/database is locked/);
    });
  });
});
```

---

## Contract Test: Interface Compliance

```typescript
/**
 * [InterfaceName] Contract Compliance Tests
 *
 * Purpose: Verify all implementations honor the interface contract
 * Layer: Boundary between layers
 * Type: Contract
 *
 * Tests EACH implementation against the same contract requirements
 * Uses REAL implementations, NO mocks
 */

import { IInterfaceName } from '@application/ports/interface-name.port';
import { Implementation1 } from '@infrastructure/adapters/implementation1.adapter';
import { Implementation2 } from '@infrastructure/adapters/implementation2.adapter';

describe('IInterfaceName Contract', () => {
  const implementations = [
    {
      name: 'Implementation1',
      factory: () => new Implementation1(realDependencies),
      skip: false,
    },
    {
      name: 'Implementation2',
      factory: () => new Implementation2(realDependencies),
      skip: !process.env.API_KEY, // Skip if API key unavailable
    },
  ];

  implementations.forEach(({ name, factory, skip }) => {
    describe(`${name} implements IInterfaceName`, () => {
      let implementation: IInterfaceName;

      beforeEach(() => {
        if (skip) {
          console.log(`Skipping ${name} - dependencies unavailable`);
          return;
        }
        implementation = factory();
      });

      // CONTRACT REQUIREMENT #1
      it('must return expected type from method1()', async () => {
        if (skip) return;

        const result = await implementation.method1(validInput);

        expect(result).toBeInstanceOf(ExpectedType);
        expect(result.requiredField).toBeDefined();
      });

      // CONTRACT REQUIREMENT #2
      it('must throw specific error on invalid input', async () => {
        if (skip) return;

        await expect(implementation.method1(invalidInput))
          .rejects.toThrow(ExpectedErrorType);
      });

      // CONTRACT REQUIREMENT #3
      it('must maintain state consistency', async () => {
        if (skip) return;

        const result1 = await implementation.method1(input);
        const result2 = await implementation.method2(result1.id);

        expect(result2.id).toBe(result1.id); // IDs match
      });

      // CONTRACT REQUIREMENT #4
      it('must clean up resources on dispose()', async () => {
        if (skip) return;

        await implementation.method1(input);
        await implementation.dispose();

        // Verify cleanup happened
        // (e.g., connections closed, timers cleared)
      });
    });
  });
});
```

---

## Contract Test: Layer Boundary

```typescript
/**
 * [Layer A] → [Layer B] Boundary Contract
 *
 * Purpose: Verify layers can actually work together
 * Type: Contract / Integration
 *
 * Tests data flow across layer boundary with REAL implementations
 */

import { LayerAService } from '@application/services/layer-a.service';
import { LayerBAdapter } from '@infrastructure/adapters/layer-b.adapter';
import { DatabaseService } from '@infrastructure/database/database.service';

describe('LayerA → LayerB Contract', () => {
  let layerA: LayerAService;
  let layerB: LayerBAdapter;
  let db: DatabaseService;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    db.onModuleInit();

    layerB = new LayerBAdapter(db); // REAL adapter
    layerA = new LayerAService(layerB); // REAL service
  });

  afterEach(() => {
    db.close();
  });

  it('CONTRACT: Data from LayerA must be acceptable to LayerB', async () => {
    // LayerA produces data
    const dataFromA = await layerA.produceData({...});

    // LayerB must accept it without transformation
    await expect(layerB.consumeData(dataFromA))
      .resolves.not.toThrow();
  });

  it('CONTRACT: Results from LayerB must be usable by LayerA', async () => {
    // LayerB produces result
    const resultFromB = await layerB.doWork({...});

    // LayerA must be able to use it
    await expect(layerA.processResult(resultFromB))
      .resolves.not.toThrow();
  });

  it('CONTRACT: Errors from LayerB must propagate to LayerA correctly', async () => {
    // LayerB encounters error
    // (Simulate by using invalid data)

    // LayerA should receive properly wrapped error
    await expect(layerA.doOperation(invalidInput))
      .rejects.toThrow(ApplicationException); // Not raw infrastructure error
  });
});
```

---

## E2E Test: User Journey

```typescript
/**
 * [Journey Name] End-to-End Test
 *
 * Purpose: Test complete user flow through entire system
 * Type: E2E
 *
 * Uses REAL: HTTP server, WebSocket, Database, CLI (or synthetic)
 * Tests: Browser → Backend → Database → CLI → Frontend
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import { DatabaseService } from '@infrastructure/database/database.service';

describe('[Journey Name] (E2E)', () => {
  let app: INestApplication;
  let socket: Socket;
  let db: DatabaseService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    db = moduleFixture.get<DatabaseService>(DatabaseService);

    // Connect WebSocket
    socket = io('http://localhost:3000', {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });
  });

  afterAll(async () => {
    socket.close();
    await app.close();
  });

  beforeEach(() => {
    // Clean database
    db.getDatabase().exec('DELETE FROM agent_messages');
    db.getDatabase().exec('DELETE FROM agents');
  });

  it('should complete full user journey: launch → view → terminate', async () => {
    // STEP 1: User launches agent via HTTP POST
    const launchResponse = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'synthetic',
        prompt: 'E2E test journey',
        configuration: { outputFormat: 'stream-json' },
      })
      .expect(201);

    const agentId = launchResponse.body.id;

    // STEP 2: WebSocket receives agent:created event
    const createdEvent = await new Promise<any>((resolve) => {
      socket.once('agent:created', resolve);
    });

    expect(createdEvent.agent.id).toBe(agentId);

    // STEP 3: User subscribes to agent (clicks agent in UI)
    socket.emit('subscribe', { agentId });

    const subscribeConfirm = await new Promise<any>((resolve) => {
      socket.once('subscribed', resolve);
    });

    expect(subscribeConfirm.agentId).toBe(agentId);

    // STEP 4: User receives messages via WebSocket
    const messages: any[] = [];
    socket.on('agent:message', (event) => {
      if (event.agentId === agentId) {
        messages.push(event.message);
      }
    });

    // STEP 5: Wait for agent completion
    await new Promise<void>((resolve) => {
      socket.on('agent:complete', (event) => {
        if (event.agentId === agentId) {
          resolve();
        }
      });
    });

    // STEP 6: Verify messages were received
    expect(messages.length).toBeGreaterThan(0);

    // STEP 7: Verify messages in database match WebSocket messages
    const dbMessages = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}/messages`)
      .expect(200);

    expect(dbMessages.body).toHaveLength(messages.length);

    // STEP 8: Verify message IDs match (same messages via WebSocket and REST)
    const wsIds = messages.map((m) => m.id).sort();
    const dbIds = dbMessages.body.map((m: any) => m.id).sort();
    expect(wsIds).toEqual(dbIds);

    // STEP 9: User terminates agent
    await request(app.getHttpServer())
      .delete(`/api/agents/${agentId}`)
      .expect(204);

    // STEP 10: WebSocket receives agent:deleted event
    const deletedEvent = await new Promise<any>((resolve) => {
      socket.once('agent:deleted', resolve);
    });

    expect(deletedEvent.agentId).toBe(agentId);

    // STEP 11: Verify agent marked as terminated in database
    const finalAgent = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}`)
      .expect(200);

    expect(finalAgent.body.status).toBe('terminated');
  });
});
```

---

## E2E Test: WebSocket Flow

```typescript
/**
 * WebSocket Message Flow E2E Test
 *
 * Purpose: Verify complete WebSocket communication path
 * Type: E2E
 */

describe('WebSocket Message Flow (E2E)', () => {
  let app: INestApplication;
  let socket: Socket;

  beforeAll(async () => {
    // Setup app and socket (same as above)
  });

  afterAll(async () => {
    socket.close();
    await app.close();
  });

  it('should stream messages in real-time with correct order', async () => {
    // Launch agent with known message schedule
    const agentId = await launchTestAgent({
      schedule: [
        { delay: 0, type: 'message', data: { content: 'Message 1' } },
        { delay: 50, type: 'message', data: { content: 'Message 2' } },
        { delay: 100, type: 'message', data: { content: 'Message 3' } },
        { delay: 150, type: 'complete', data: { success: true } },
      ],
    });

    // Subscribe
    socket.emit('subscribe', { agentId });

    // Collect messages
    const messages: any[] = [];
    const timestamps: number[] = [];

    socket.on('agent:message', (event) => {
      messages.push(event.message);
      timestamps.push(Date.now());
    });

    // Wait for completion
    await new Promise<void>((resolve) => {
      socket.on('agent:complete', () => resolve());
    });

    // Verify: 3 messages received
    expect(messages).toHaveLength(3);

    // Verify: Messages in correct order
    expect(messages[0].sequenceNumber).toBe(1);
    expect(messages[1].sequenceNumber).toBe(2);
    expect(messages[2].sequenceNumber).toBe(3);

    // Verify: Timing is approximately correct
    const delays = timestamps.map((t, i) => i === 0 ? 0 : t - timestamps[i - 1]);
    expect(delays[1]).toBeGreaterThan(40); // ~50ms delay
    expect(delays[1]).toBeLessThan(100); // But not too late
  });
});
```

---

## Performance Test

```typescript
/**
 * [Component] Performance Tests
 *
 * Purpose: Verify performance requirements are met
 * Type: Performance / Integration
 *
 * Tests execution time, throughput, memory usage
 */

describe('[Component] Performance', () => {
  describe('Query Performance', () => {
    it('should query by ID in <5ms', async () => {
      // Setup: Create test data
      const entity = await createTestEntity();

      // Measure
      const start = performance.now();
      await repository.findById(entity.id);
      const duration = performance.now() - start;

      // Assert
      expect(duration).toBeLessThan(5);
    });

    it('should query 1000 records in <50ms', async () => {
      // Setup: Create 1000 entities
      await Promise.all(
        Array.from({ length: 1000 }, () => createTestEntity())
      );

      // Measure
      const start = performance.now();
      const all = await repository.findAll();
      const duration = performance.now() - start;

      // Assert
      expect(all).toHaveLength(1000);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Throughput', () => {
    it('should handle 100 concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, () =>
        service.doOperation({...})
      );

      const start = performance.now();
      const results = await Promise.all(operations);
      const duration = performance.now() - start;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // 100 ops in <1s
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with 1000 operations', async () => {
      const before = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        await service.doOperation({...});
      }

      // Force garbage collection (run with --expose-gc)
      if (global.gc) {
        global.gc();
      }

      const after = process.memoryUsage().heapUsed;
      const increase = after - before;

      // Memory increase should be minimal (<10MB for 1000 ops)
      expect(increase).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
```

---

## Frontend Component Test

```typescript
/**
 * [ComponentName] Component Tests
 *
 * Purpose: Verify component renders correctly and handles interactions
 * Layer: Presentation
 * Type: Unit (component)
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ComponentName } from '@/components/ComponentName';
import { createMockStore } from '@headless-agent-manager/client/testing';

describe('ComponentName', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  const renderComponent = (props = {}) => {
    return render(
      <Provider store={store}>
        <ComponentName {...props} />
      </Provider>
    );
  };

  describe('Rendering', () => {
    it('should render with initial state', () => {
      renderComponent();

      expect(screen.getByText('Expected Text')).toBeInTheDocument();
    });

    it('should render with props', () => {
      renderComponent({ someProp: 'value' });

      expect(screen.getByText('value')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should handle button click', async () => {
      renderComponent();

      const button = screen.getByRole('button', { name: 'Click Me' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Clicked')).toBeInTheDocument();
      });
    });

    it('should dispatch Redux action on interaction', () => {
      const dispatchSpy = jest.spyOn(store, 'dispatch');

      renderComponent();

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'expectedAction' })
      );
    });
  });

  describe('Redux State Integration', () => {
    it('should update when Redux state changes', () => {
      renderComponent();

      // Dispatch state change
      store.dispatch(actionCreator({ newValue: 'Updated' }));

      // Component should reflect new state
      expect(screen.getByText('Updated')).toBeInTheDocument();
    });
  });
});
```

---

## Quick Reference: Which Template When?

```
Testing Domain Entity?
  → Use "Unit Test: Domain Entity"

Testing Value Object?
  → Use "Unit Test: Value Object"

Testing Application Service?
  → Use "Unit Test: Application Service"

Testing Repository with Database?
  → Use "Integration Test: Repository + Database"

Testing Service with Real Infrastructure?
  → Use "Integration Test: Service + Infrastructure"

Testing Interface Implementation?
  → Use "Contract Test: Interface Compliance"

Testing Layer Boundary?
  → Use "Contract Test: Layer Boundary"

Testing Complete User Flow?
  → Use "E2E Test: User Journey"

Testing WebSocket Communication?
  → Use "E2E Test: WebSocket Flow"

Testing Performance?
  → Use "Performance Test"

Testing Frontend Component?
  → Use "Frontend Component Test"
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-23
**Maintained By**: AI Agents
**Usage**: Copy template, fill in placeholders, follow TDD workflow
