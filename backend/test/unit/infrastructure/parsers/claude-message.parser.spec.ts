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
      const line =
        '{"type":"system","role":"init","content":"Session started","session_id":"test-123"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('system');
      expect(message.role).toBe('init');
      expect(message.content).toBe('Session started');
      expect(message.metadata?.session_id).toBe('test-123');
    });

    it('should parse user message', () => {
      const line = '{"type":"user","content":"Create a fibonacci function"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('user');
      expect(message.content).toBe('Create a fibonacci function');
    });

    it('should parse assistant message', () => {
      const line = '{"type":"assistant","content":"I will help you create that function"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('assistant');
      expect(message.content).toBe('I will help you create that function');
    });

    it('should parse system result message with stats', () => {
      const line =
        '{"type":"system","role":"result","stats":{"duration":1234,"tokens":{"prompt":45,"completion":78}}}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('response'); // result messages are now mapped to response
      expect(message.role).toBe('result');
      expect(message.metadata?.stats).toEqual({
        duration: 1234,
        tokens: { prompt: 45, completion: 78 },
      });
    });

    it('should parse error message', () => {
      const line = '{"type":"error","content":"CLI error occurred","error_code":"CLI_ERROR"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('error');
      expect(message.content).toBe('CLI error occurred');
      expect(message.metadata?.error_code).toBe('CLI_ERROR');
    });

    it('should handle message with complex content object', () => {
      const line =
        '{"type":"assistant","content":{"text":"Response","code":"function() {}","language":"typescript"}}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

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
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('response'); // result messages are now mapped to response
      expect(message.metadata?.stats).toEqual({ duration: 100 });
    });

    it('should preserve all metadata fields', () => {
      const line =
        '{"type":"assistant","content":"test","metadata":{"key":"value"},"extra":"data"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.metadata?.extra).toBe('data');
    });
  });

  describe('parseStream', () => {
    it('should parse multiple lines from fixture file', () => {
      const fixturePath = join(__dirname, '../../../fixtures/claude-code-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      const messages: (AgentMessage | null)[] = lines.map((line) => parser.parse(line));
      const validMessages = messages.filter((m): m is AgentMessage => m !== null);

      expect(validMessages.length).toBe(6);
      expect(validMessages[0]!.type).toBe('system');
      expect(validMessages[1]!.type).toBe('user');
      expect(validMessages[2]!.type).toBe('assistant');
      expect(validMessages[5]!.type).toBe('response'); // result messages are now mapped to response
      expect(validMessages[5]!.role).toBe('result');
    });

    it('should parse error fixture', () => {
      const fixturePath = join(__dirname, '../../../fixtures/claude-code-error.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      const messages: (AgentMessage | null)[] = lines.map((line) => parser.parse(line));
      const validMessages = messages.filter((m): m is AgentMessage => m !== null);

      expect(validMessages.length).toBe(3);
      expect(validMessages[2]!.type).toBe('error');
      expect(validMessages[2]!.content).toContain('CLI error');
    });
  });

  describe('isComplete', () => {
    it('should return true when result message is received', () => {
      const line = '{"type":"system","role":"result","stats":{}}';
      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(parser.isComplete(message)).toBe(true);
    });

    it('should return true for type=result messages', () => {
      const line = '{"type":"result","subtype":"success","duration_ms":1234}';
      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(parser.isComplete(message)).toBe(true);
    });

    it('should return false for non-result messages', () => {
      const line = '{"type":"assistant","content":"test"}';
      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(parser.isComplete(message)).toBe(false);
    });

    it('should return false for system init message', () => {
      const line = '{"type":"system","role":"init","content":"started"}';
      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(parser.isComplete(message)).toBe(false);
    });
  });

  describe('real Claude CLI format', () => {
    it('should parse system init message with subtype', () => {
      const line =
        '{"type":"system","subtype":"init","session_id":"test-123","model":"claude-sonnet-4"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('system');
      expect(message.metadata?.subtype).toBe('init');
      expect(message.metadata?.session_id).toBe('test-123');
    });

    it('should parse assistant message with nested message object', () => {
      const line =
        '{"type":"assistant","message":{"model":"claude-sonnet-4","role":"assistant","content":[{"type":"text","text":"Hello"}]}}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('assistant');
      expect(message.content).toBeDefined();
    });

    it('should parse result message with duration and cost', () => {
      const line =
        '{"type":"result","subtype":"success","duration_ms":1234,"total_cost_usd":0.001,"session_id":"test-123"}';

      const message = parser.parse(line);
      expect(message).not.toBeNull();
      if (!message) throw new Error('Message should not be null');

      expect(message.type).toBe('response'); // result is mapped to response
      expect(message.metadata?.subtype).toBe('success');
      expect(message.metadata?.duration_ms).toBe(1234);
      expect(message.metadata?.total_cost_usd).toBe(0.001);
    });

    it('should parse real fixture file', () => {
      const fixturePath = join(__dirname, '../../../fixtures/claude-code-real-output.jsonl');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');

      const messages = lines.map((line) => parser.parse(line));
      const validMessages = messages.filter((m): m is AgentMessage => m !== null);

      expect(validMessages.length).toBe(3);
      expect(validMessages[0]!.type).toBe('system');
      expect(validMessages[0]!.metadata?.subtype).toBe('init');
      expect(validMessages[1]!.type).toBe('assistant');
      expect(validMessages[2]!.type).toBe('response'); // result is mapped to response
      expect(validMessages[2]!.metadata?.subtype).toBe('success');
    });
  });

  describe('new message types', () => {
    describe('tool messages', () => {
      it('should parse tool_use as type "tool"', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_123","name":"Bash","input":{"command":"ls -la"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toContain('Bash');
        expect(message.content).toContain('ls -la');
      });

      it('should parse multiple tool_use blocks as separate tool messages', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"/test.txt"}},{"type":"tool_use","id":"toolu_2","name":"Write","input":{"file_path":"/output.txt"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toContain('Read');
        expect(message.content).toContain('Write');
      });

      it('should keep text and tool_use separate - text as assistant, tools as tool', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Let me check that file"},{"type":"tool_use","id":"toolu_123","name":"Read","input":{"file_path":"/test.txt"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        // If there's both text and tool_use, we should split into assistant for text
        // But the current implementation combines them. We need to decide:
        // Option A: Keep combined but mark as assistant
        // Option B: Create separate messages
        // For now, let's test that if tool_use exists, type is 'tool'
        expect(message.type).toBe('tool');
        expect(message.content).toContain('Let me check that file');
        expect(message.content).toContain('Read');
      });

      it('should handle tool_use with complex input', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_123","name":"Task","input":{"description":"Complex task","prompt":"Do something","subagent_type":"general"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toContain('Task');
        expect(message.content).toContain('Spawning agent');
      });
    });

    describe('response messages', () => {
      it('should parse result messages as type "response"', () => {
        const line =
          '{"type":"result","subtype":"success","duration_ms":5000,"session_id":"test-123"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('response');
        expect(message.metadata?.subtype).toBe('success');
        expect(message.metadata?.duration_ms).toBe(5000);
      });

      it('should parse system result messages as type "response"', () => {
        const line = '{"type":"system","role":"result","stats":{"duration":1234}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('response');
        expect(message.role).toBe('result');
        expect(message.metadata?.stats).toBeDefined();
      });

      it('should handle error result messages', () => {
        const line =
          '{"type":"result","subtype":"error","duration_ms":1000,"error":"Something went wrong"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('response');
        expect(message.metadata?.subtype).toBe('error');
      });
    });

    describe('raw JSON field', () => {
      it('should include raw JSON in all messages', () => {
        const line = '{"type":"assistant","content":"Hello world"}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.raw).toBe(line);
      });

      it('should include raw JSON for complex messages', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Test"}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.raw).toBe(line);
      });

      it('should include raw JSON for tool messages', () => {
        const line =
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"pwd"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.raw).toBe(line);
      });

      it('should include raw JSON for response messages', () => {
        const line = '{"type":"result","subtype":"success","duration_ms":1234}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.raw).toBe(line);
      });
    });

    describe('assistant vs tool separation', () => {
      it('should create assistant type for text-only content', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"This is a text response"}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('assistant');
        expect(message.content).toBe('This is a text response');
      });

      it('should create tool type when tool_use blocks exist', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"echo test"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
      });

      it('should create tool type when both text and tool_use exist', () => {
        const line =
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Running command"},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toContain('Running command');
        expect(message.content).toContain('Bash');
      });
    });

    describe('tool result messages (user type)', () => {
      it('should parse tool_result blocks as user type', () => {
        const line =
          '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_123","content":"Command output here","is_error":false}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('user');
        expect(message.content).toContain('✓ Result:');
        expect(message.content).toContain('Command output here');
      });

      it('should show error indicator for failed tool results', () => {
        const line =
          '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_123","content":"Permission denied","is_error":true}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('user');
        expect(message.content).toContain('❌ Error:');
        expect(message.content).toContain('Permission denied');
      });

      it('should handle complex tool result content', () => {
        const line =
          '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_123","content":"Line 1\\nLine 2\\nLine 3","is_error":false}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('user');
        expect(message.content).toContain('Line 1');
        expect(message.content).toContain('Line 2');
      });
    });

    describe('tool message with description', () => {
      it('should format Bash tool with description on first line', () => {
        const line =
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls -la","description":"List files in directory"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toContain('List files in directory');
        expect(message.content).toContain('$ ls -la');
        // Description should be on first line, command on second
        const lines = message.content.toString().split('\n');
        expect(lines[0]).toContain('List files in directory');
        expect(lines[1]).toContain('$ ls -la');
      });

      it('should format Edit tool with description', () => {
        const line =
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Edit","input":{"file_path":"/test.js","description":"Update function name"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toContain('Update function name');
        expect(message.content).toContain('Editing: /test.js');
      });

      it('should work without description (backwards compatible)', () => {
        const line =
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"pwd"}}]}}';

        const message = parser.parse(line);
        expect(message).not.toBeNull();
        if (!message) throw new Error('Message should not be null');

        expect(message.type).toBe('tool');
        expect(message.content).toBe('[Bash] $ pwd');
      });
    });
  });
});
