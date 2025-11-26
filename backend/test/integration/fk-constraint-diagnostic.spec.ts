/**
 * FK Constraint Diagnostic Test
 *
 * Purpose: Diagnose why FK constraint tests pass individually but fail in full suite
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentMessageService } from '@application/services/agent-message.service';

describe('FK Constraint Diagnostic', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    db.onModuleInit();
    messageService = new AgentMessageService(db);

    console.log('\n[DIAGNOSTIC] Test starting, FK pragma:', db.getDatabase().pragma('foreign_keys', { simple: true }));
  });

  afterEach(() => {
    console.log('[DIAGNOSTIC] Test ending, FK pragma:', db.getDatabase().pragma('foreign_keys', { simple: true }));
    db.close();
  });

  it('DIAGNOSTIC: FK constraints should be enabled', () => {
    const fk = db.getDatabase().pragma('foreign_keys', { simple: true });
    console.log('[DIAGNOSTIC] FK enabled:', fk);
    expect(fk).toBe(1);
  });

  it('DIAGNOSTIC: FK violation should throw error', async () => {
    const fakeId = `diagnostic-fake-${Date.now()}-${Math.random()}`;
    console.log('[DIAGNOSTIC] Attempting save with fake ID:', fakeId);

    try {
      await messageService.saveMessage({
        agentId: fakeId,
        type: 'assistant',
        content: 'Should fail',
      });
      console.log('[DIAGNOSTIC] ERROR: Save succeeded when it should have failed!');
      throw new Error('Test failed: FK violation did not throw');
    } catch (error: any) {
      console.log('[DIAGNOSTIC] Save failed as expected:', error.message);
      expect(error.message).toContain('FOREIGN KEY constraint failed');
    }
  });

  it('DIAGNOSTIC: Can create table and check FK list', () => {
    const foreignKeys = db.getDatabase().pragma('foreign_key_list(agent_messages)');
    console.log('[DIAGNOSTIC] Foreign keys for agent_messages table:', JSON.stringify(foreignKeys, null, 2));
    expect(foreignKeys).toHaveLength(1);
  });
});
