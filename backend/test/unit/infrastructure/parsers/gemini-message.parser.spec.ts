import { GeminiMessageParser } from '@infrastructure/parsers/gemini-message.parser';
import { AgentMessage } from '@application/ports/agent-runner.port';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('GeminiMessageParser', () => {
  let parser: GeminiMessageParser;

  beforeEach(() => {
    parser = new GeminiMessageParser();
  });

  describe('parse', () => {
    describe('init events', () => {
      it('should return null for init events (skip them)', () => {
        const line = '{"type":"init","timestamp":"2025-12-02T22:31:40.995Z","session_id":"5bafab79-241e-4f9a-95f8-05722ffd6688","model":"auto"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should skip init events with different formats', () => {
        const line = '{"type":"init","session_id":"test-123","model":"gemini-pro"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });
    });

    describe('user messages', () => {
      it('should parse user message', () => {
        const line = '{"type":"message","timestamp":"2025-12-02T22:31:40.996Z","role":"user","content":"Explain TypeScript in one sentence."}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('user');
        expect(message.role).toBe('user');
        expect(message.content).toBe('Explain TypeScript in one sentence.');
      });

      it('should parse user message without timestamp', () => {
        const line = '{"type":"message","role":"user","content":"Test prompt"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('user');
        expect(message.content).toBe('Test prompt');
      });

      it('should include raw JSON in user messages', () => {
        const line = '{"type":"message","role":"user","content":"Test"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.raw).toBe(line);
      });
    });

    describe('assistant messages (delta)', () => {
      it('should parse assistant message with delta=true', () => {
        const line = '{"type":"message","timestamp":"2025-12-02T22:31:44.781Z","role":"assistant","content":"TypeScript is a supers","delta":true}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('assistant');
        expect(message.role).toBe('assistant');
        expect(message.content).toBe('TypeScript is a supers');
        expect(message.metadata?.delta).toBe(true);
      });

      it('should parse multiple delta chunks', () => {
        const lines = [
          '{"type":"message","role":"assistant","content":"First chunk ","delta":true}',
          '{"type":"message","role":"assistant","content":"second chunk ","delta":true}',
          '{"type":"message","role":"assistant","content":"final chunk.","delta":true}',
        ];

        const messages = lines.map(line => parser.parse(line));
        expect(messages).toHaveLength(3);

        messages.forEach(msg => {
          expect(msg).not.toBeNull();
          if (!msg) throw new Error('Message should not be null');
          expect(msg.type).toBe('assistant');
          expect(msg.metadata?.delta).toBe(true);
        });

        expect(messages[0]!.content).toBe('First chunk ');
        expect(messages[1]!.content).toBe('second chunk ');
        expect(messages[2]!.content).toBe('final chunk.');
      });

      it('should handle assistant message without delta flag', () => {
        const line = '{"type":"message","role":"assistant","content":"Complete message"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('assistant');
        expect(message.content).toBe('Complete message');
        expect(message.metadata?.delta).toBeUndefined();
      });

      it('should include raw JSON in assistant messages', () => {
        const line = '{"type":"message","role":"assistant","content":"Test","delta":true}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.raw).toBe(line);
      });
    });

    describe('result events', () => {
      it('should return null for result events (skip them)', () => {
        const line = '{"type":"result","timestamp":"2025-12-02T22:31:44.789Z","status":"success","stats":{"total_tokens":12601,"input_tokens":12484,"output_tokens":71,"duration_ms":3794,"tool_calls":0}}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should skip result events with different formats', () => {
        const line = '{"type":"result","status":"failed","error":"Something went wrong"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should skip result events with minimal data', () => {
        const line = '{"type":"result"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });
    });

    describe('timestamp handling', () => {
      it('should preserve timestamp in metadata', () => {
        const line = '{"type":"message","timestamp":"2025-12-02T22:31:40.996Z","role":"user","content":"Test"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.metadata?.timestamp).toBe('2025-12-02T22:31:40.996Z');
      });

      it('should handle messages without timestamp', () => {
        const line = '{"type":"message","role":"user","content":"Test"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.metadata?.timestamp).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should return null for invalid JSON', () => {
        const line = 'not-valid-json';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should return null for empty lines', () => {
        const line = '';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should return null for whitespace-only lines', () => {
        const line = '   \n  \t  ';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should return null for lines with only newline', () => {
        const line = '\n';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should return null when JSON is missing type field', () => {
        const line = '{"content":"test"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should return null when JSON is missing role field for messages', () => {
        const line = '{"type":"message","content":"test"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should return null when JSON is missing content field for messages', () => {
        const line = '{"type":"message","role":"user"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });

      it('should handle non-message types gracefully', () => {
        const line = '{"type":"unknown","data":"something"}';

        const message = parser.parse(line);
        expect(message).toBeNull();
      });
    });

    describe('metadata preservation', () => {
      it('should preserve all metadata fields', () => {
        const line = '{"type":"message","role":"user","content":"test","custom_field":"value","another_field":123}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.metadata?.custom_field).toBe('value');
        expect(message.metadata?.another_field).toBe(123);
      });

      it('should preserve delta flag in metadata', () => {
        const line = '{"type":"message","role":"assistant","content":"chunk","delta":true}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.metadata?.delta).toBe(true);
      });
    });
  });

  describe('parseStream', () => {
    it('should parse multiple lines from fixture file', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      // First line is a warning message, skip it
      const jsonLines = lines.filter(line => line.trim().startsWith('{'));

      const messages: (AgentMessage | null)[] = jsonLines.map((line) => parser.parse(line));
      const validMessages = messages.filter((m): m is AgentMessage => m !== null);

      // Should have 1 user message + 3 assistant delta chunks = 4 messages
      // (init and result events are skipped)
      expect(validMessages.length).toBe(4);
      expect(validMessages[0]!.type).toBe('user');
      expect(validMessages[0]!.content).toBe('Explain TypeScript in one sentence.');

      expect(validMessages[1]!.type).toBe('assistant');
      expect(validMessages[1]!.content).toContain('TypeScript is a supers');
      expect(validMessages[1]!.metadata?.delta).toBe(true);

      expect(validMessages[2]!.type).toBe('assistant');
      expect(validMessages[2]!.metadata?.delta).toBe(true);

      expect(validMessages[3]!.type).toBe('assistant');
      expect(validMessages[3]!.metadata?.delta).toBe(true);
    });

    it('should handle fixture with non-JSON first line', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Parse all lines (including non-JSON warning)
      const messages = lines.map(line => parser.parse(line));
      const validMessages = messages.filter((m): m is AgentMessage => m !== null);

      // Should still get 4 valid messages
      expect(validMessages.length).toBe(4);
    });

    it('should preserve message order', () => {
      const lines = [
        '{"type":"init","session_id":"test"}',
        '{"type":"message","role":"user","content":"Prompt"}',
        '{"type":"message","role":"assistant","content":"Part 1","delta":true}',
        '{"type":"message","role":"assistant","content":"Part 2","delta":true}',
        '{"type":"result","status":"success"}',
      ];

      const messages = lines.map(line => parser.parse(line));
      const validMessages = messages.filter((m): m is AgentMessage => m !== null);

      expect(validMessages).toHaveLength(3);
      expect(validMessages[0]!.type).toBe('user');
      expect(validMessages[1]!.type).toBe('assistant');
      expect(validMessages[2]!.type).toBe('assistant');
    });
  });

  describe('isComplete', () => {
    it('should return false for user messages', () => {
      const line = '{"type":"message","role":"user","content":"test"}';
      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(parser.isComplete(message)).toBe(false);
    });

    it('should return false for assistant messages', () => {
      const line = '{"type":"message","role":"assistant","content":"test","delta":true}';
      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(parser.isComplete(message)).toBe(false);
    });

    it('should return false for all message types since result events are skipped', () => {
      // Since we skip result events, no parsed message should indicate completion
      const lines = [
        '{"type":"message","role":"user","content":"test"}',
        '{"type":"message","role":"assistant","content":"response"}',
      ];

      lines.forEach(line => {
        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');
        expect(parser.isComplete(message)).toBe(false);
      });
    });
  });

  describe('integration with real fixture', () => {
    it('should correctly extract all message content from fixture', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim().startsWith('{'));

      const messages = lines
        .map(line => parser.parse(line))
        .filter((m): m is AgentMessage => m !== null);

      // Verify complete response by concatenating delta chunks
      const assistantChunks = messages
        .filter(m => m.type === 'assistant')
        .map(m => m.content as string);

      const completeResponse = assistantChunks.join('');
      expect(completeResponse).toContain('TypeScript is a superset of JavaScript');
      expect(completeResponse).toContain('optional static typing');
      expect(completeResponse).toContain('class-based object-oriented programming');
    });

    it('should have correct message count', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim().startsWith('{'));

      const messages = lines
        .map(line => parser.parse(line))
        .filter((m): m is AgentMessage => m !== null);

      // 1 user + 3 assistant deltas = 4 total
      expect(messages).toHaveLength(4);
    });

    it('should preserve timestamps from fixture', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim().startsWith('{'));

      const messages = lines
        .map(line => parser.parse(line))
        .filter((m): m is AgentMessage => m !== null);

      // All messages should have timestamps
      messages.forEach(msg => {
        expect(msg.metadata?.timestamp).toBeDefined();
        expect(typeof msg.metadata?.timestamp).toBe('string');
      });
    });
  });
});
