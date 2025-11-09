import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';
import { AgentMessage } from '@application/ports/agent-runner.port';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('ClaudeMessageParser', () => {
  let parser: ClaudeMessageParser;

  beforeEach(() => {
    parser = new ClaudeMessageParser();
  });

  describe('parse', () => {
    it('should parse system init message', () => {
      const line = '{"type":"system","role":"init","content":"Session started","session_id":"test-123"}';

      const message = parser.parse(line);

      expect(message.type).toBe('system');
      expect(message.role).toBe('init');
      expect(message.content).toBe('Session started');
      expect(message.metadata?.session_id).toBe('test-123');
    });

    it('should parse user message', () => {
      const line = '{"type":"user","content":"Create a fibonacci function"}';

      const message = parser.parse(line);

      expect(message.type).toBe('user');
      expect(message.content).toBe('Create a fibonacci function');
    });

    it('should parse assistant message', () => {
      const line = '{"type":"assistant","content":"I will help you create that function"}';

      const message = parser.parse(line);

      expect(message.type).toBe('assistant');
      expect(message.content).toBe('I will help you create that function');
    });

    it('should parse system result message with stats', () => {
      const line = '{"type":"system","role":"result","stats":{"duration":1234,"tokens":{"prompt":45,"completion":78}}}';

      const message = parser.parse(line);

      expect(message.type).toBe('system');
      expect(message.role).toBe('result');
      expect(message.metadata?.stats).toEqual({
        duration: 1234,
        tokens: { prompt: 45, completion: 78 },
      });
    });

    it('should parse error message', () => {
      const line = '{"type":"error","content":"CLI error occurred","error_code":"CLI_ERROR"}';

      const message = parser.parse(line);

      expect(message.type).toBe('error');
      expect(message.content).toBe('CLI error occurred');
      expect(message.metadata?.error_code).toBe('CLI_ERROR');
    });

    it('should handle message with complex content object', () => {
      const line = '{"type":"assistant","content":{"text":"Response","code":"function() {}","language":"typescript"}}';

      const message = parser.parse(line);

      expect(message.type).toBe('assistant');
      expect(message.content).toEqual({
        text: 'Response',
        code: 'function() {}',
        language: 'typescript',
      });
    });

    it('should throw error when line is not valid JSON', () => {
      const line = 'not-valid-json';

      expect(() => parser.parse(line)).toThrow('Invalid JSON');
    });

    it('should throw error when JSON is missing type field', () => {
      const line = '{"content":"test"}';

      expect(() => parser.parse(line)).toThrow('Missing required field: type');
    });

    it('should throw error when JSON is missing content field', () => {
      const line = '{"type":"assistant"}';

      expect(() => parser.parse(line)).toThrow('Missing required field: content or stats');
    });

    it('should allow stats without content for system messages', () => {
      const line = '{"type":"system","role":"result","stats":{"duration":100}}';

      const message = parser.parse(line);

      expect(message.type).toBe('system');
      expect(message.metadata?.stats).toEqual({ duration: 100 });
    });

    it('should preserve all metadata fields', () => {
      const line = '{"type":"assistant","content":"test","metadata":{"key":"value"},"extra":"data"}';

      const message = parser.parse(line);

      expect(message.metadata?.extra).toBe('data');
    });
  });

  describe('parseStream', () => {
    it('should parse multiple lines from fixture file', () => {
      const fixturePath = join(__dirname, '../../../fixtures/claude-code-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      const messages: AgentMessage[] = lines.map((line) => parser.parse(line));

      expect(messages.length).toBe(6);
      expect(messages[0]!.type).toBe('system');
      expect(messages[1]!.type).toBe('user');
      expect(messages[2]!.type).toBe('assistant');
      expect(messages[5]!.type).toBe('system');
      expect(messages[5]!.role).toBe('result');
    });

    it('should parse error fixture', () => {
      const fixturePath = join(__dirname, '../../../fixtures/claude-code-error.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      const messages: AgentMessage[] = lines.map((line) => parser.parse(line));

      expect(messages.length).toBe(3);
      expect(messages[2]!.type).toBe('error');
      expect(messages[2]!.content).toContain('CLI error');
    });
  });

  describe('isComplete', () => {
    it('should return true when result message is received', () => {
      const line = '{"type":"system","role":"result","stats":{}}';
      const message = parser.parse(line);

      expect(parser.isComplete(message)).toBe(true);
    });

    it('should return true for type=result messages', () => {
      const line = '{"type":"result","subtype":"success","duration_ms":1234}';
      const message = parser.parse(line);

      expect(parser.isComplete(message)).toBe(true);
    });

    it('should return false for non-result messages', () => {
      const line = '{"type":"assistant","content":"test"}';
      const message = parser.parse(line);

      expect(parser.isComplete(message)).toBe(false);
    });

    it('should return false for system init message', () => {
      const line = '{"type":"system","role":"init","content":"started"}';
      const message = parser.parse(line);

      expect(parser.isComplete(message)).toBe(false);
    });
  });

  describe('real Claude CLI format', () => {
    it('should parse system init message with subtype', () => {
      const line =
        '{"type":"system","subtype":"init","session_id":"test-123","model":"claude-sonnet-4"}';

      const message = parser.parse(line);

      expect(message.type).toBe('system');
      expect(message.metadata?.subtype).toBe('init');
      expect(message.metadata?.session_id).toBe('test-123');
    });

    it('should parse assistant message with nested message object', () => {
      const line =
        '{"type":"assistant","message":{"model":"claude-sonnet-4","role":"assistant","content":[{"type":"text","text":"Hello"}]}}';

      const message = parser.parse(line);

      expect(message.type).toBe('assistant');
      expect(message.content).toBeDefined();
    });

    it('should parse result message with duration and cost', () => {
      const line =
        '{"type":"result","subtype":"success","duration_ms":1234,"total_cost_usd":0.001,"session_id":"test-123"}';

      const message = parser.parse(line);

      expect(message.type).toBe('system'); // result is mapped to system
      expect(message.metadata?.subtype).toBe('success');
      expect(message.metadata?.duration_ms).toBe(1234);
      expect(message.metadata?.total_cost_usd).toBe(0.001);
    });

    it('should parse real fixture file', () => {
      const fixturePath = join(__dirname, '../../../fixtures/claude-code-real-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      const messages = lines.map((line) => parser.parse(line));

      expect(messages.length).toBe(3);
      expect(messages[0]!.type).toBe('system');
      expect(messages[0]!.metadata?.subtype).toBe('init');
      expect(messages[1]!.type).toBe('assistant');
      expect(messages[2]!.type).toBe('system'); // result is mapped to system
      expect(messages[2]!.metadata?.subtype).toBe('success');
    });
  });
});
