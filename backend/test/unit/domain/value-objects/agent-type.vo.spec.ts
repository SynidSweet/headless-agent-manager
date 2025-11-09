import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('AgentType Value Object', () => {
  describe('enum values', () => {
    it('should have CLAUDE_CODE type', () => {
      expect(AgentType.CLAUDE_CODE).toBe('claude-code');
    });

    it('should have GEMINI_CLI type', () => {
      expect(AgentType.GEMINI_CLI).toBe('gemini-cli');
    });
  });

  describe('enum completeness', () => {
    it('should have exactly 2 agent types for MVP', () => {
      const types = Object.values(AgentType);
      expect(types).toHaveLength(2);
    });

    it('should contain all expected agent types', () => {
      const types = Object.values(AgentType);
      expect(types).toEqual(['claude-code', 'gemini-cli']);
    });
  });

  describe('type safety', () => {
    it('should be usable in type annotations', () => {
      const type: AgentType = AgentType.CLAUDE_CODE;
      expect(type).toBe('claude-code');
    });

    it('should support all agent types', () => {
      const types: AgentType[] = [AgentType.CLAUDE_CODE, AgentType.GEMINI_CLI];

      expect(types).toHaveLength(2);
    });
  });

  describe('string representation', () => {
    it('should have kebab-case format for CLI compatibility', () => {
      expect(AgentType.CLAUDE_CODE).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(AgentType.GEMINI_CLI).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });
  });
});
