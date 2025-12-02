import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('AgentType Value Object', () => {
  describe('enum values', () => {
    it('should have CLAUDE_CODE type', () => {
      expect(AgentType.CLAUDE_CODE).toBe('claude-code');
    });

    it('should have GEMINI_CLI type', () => {
      expect(AgentType.GEMINI_CLI).toBe('gemini-cli');
    });

    it('should have SYNTHETIC type for testing', () => {
      expect(AgentType.SYNTHETIC).toBe('synthetic');
    });
  });

  describe('enum completeness', () => {
    it('should have exactly 3 agent types (MVP + testing)', () => {
      const types = Object.values(AgentType);
      expect(types).toHaveLength(3);
    });

    it('should contain all expected agent types', () => {
      const types = Object.values(AgentType);
      expect(types).toEqual(['claude-code', 'gemini-cli', 'synthetic']);
    });
  });

  describe('type safety', () => {
    it('should be usable in type annotations', () => {
      const type: AgentType = AgentType.CLAUDE_CODE;
      expect(type).toBe('claude-code');
    });

    it('should support all agent types', () => {
      const types: AgentType[] = [AgentType.CLAUDE_CODE, AgentType.GEMINI_CLI, AgentType.SYNTHETIC];

      expect(types).toHaveLength(3);
    });
  });

  describe('string representation', () => {
    it('should have kebab-case format for CLI compatibility', () => {
      expect(AgentType.CLAUDE_CODE).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(AgentType.GEMINI_CLI).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(AgentType.SYNTHETIC).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });
  });
});
