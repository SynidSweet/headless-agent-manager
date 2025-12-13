import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';

describe('ProviderCapabilities Value Object', () => {
  describe('create', () => {
    it('should create with all capabilities enabled', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: true,
        mcpSupport: true,
        modelSelection: true,
      });

      expect(caps.streaming).toBe(true);
      expect(caps.multiTurn).toBe(true);
      expect(caps.toolUse).toBe(true);
      expect(caps.fileAccess).toBe(true);
      expect(caps.customInstructions).toBe(true);
      expect(caps.mcpSupport).toBe(true);
      expect(caps.modelSelection).toBe(true);
    });

    it('should create with all capabilities disabled', () => {
      const caps = ProviderCapabilities.create({
        streaming: false,
        multiTurn: false,
        toolUse: false,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: false,
      });

      expect(caps.streaming).toBe(false);
      expect(caps.multiTurn).toBe(false);
      expect(caps.toolUse).toBe(false);
      expect(caps.fileAccess).toBe(false);
      expect(caps.customInstructions).toBe(false);
      expect(caps.mcpSupport).toBe(false);
      expect(caps.modelSelection).toBe(false);
    });

    it('should create with mixed capabilities', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: true,
        fileAccess: false,
        customInstructions: true,
        mcpSupport: false,
        modelSelection: true,
      });

      expect(caps.streaming).toBe(true);
      expect(caps.multiTurn).toBe(false);
      expect(caps.toolUse).toBe(true);
      expect(caps.fileAccess).toBe(false);
      expect(caps.customInstructions).toBe(true);
      expect(caps.mcpSupport).toBe(false);
      expect(caps.modelSelection).toBe(true);
    });
  });

  describe('has', () => {
    it('should return true for enabled capabilities', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: true,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: false,
      });

      expect(caps.has('streaming')).toBe(true);
      expect(caps.has('toolUse')).toBe(true);
    });

    it('should return false for disabled capabilities', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: false,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: false,
      });

      expect(caps.has('multiTurn')).toBe(false);
      expect(caps.has('toolUse')).toBe(false);
    });
  });

  describe('toArray', () => {
    it('should return only enabled capabilities', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: true,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: true,
      });

      const array = caps.toArray();
      expect(array).toContain('streaming');
      expect(array).toContain('toolUse');
      expect(array).toContain('modelSelection');
      expect(array).not.toContain('multiTurn');
      expect(array).not.toContain('fileAccess');
      expect(array.length).toBe(3);
    });

    it('should return empty array when no capabilities enabled', () => {
      const caps = ProviderCapabilities.create({
        streaming: false,
        multiTurn: false,
        toolUse: false,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: false,
      });

      expect(caps.toArray()).toEqual([]);
    });

    it('should return all capability names when all enabled', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: true,
        mcpSupport: true,
        modelSelection: true,
      });

      const array = caps.toArray();
      expect(array.length).toBe(7);
      expect(array).toContain('streaming');
      expect(array).toContain('multiTurn');
      expect(array).toContain('toolUse');
      expect(array).toContain('fileAccess');
      expect(array).toContain('customInstructions');
      expect(array).toContain('mcpSupport');
      expect(array).toContain('modelSelection');
    });
  });
});
