/**
 * Provider Registry Configuration
 * Static configuration for all providers and models
 */

export const PROVIDER_CONFIGS = {
  'claude-code': {
    name: 'Claude Code',
    description: 'Anthropic Claude AI agent with advanced coding capabilities',
    models: [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Best model for complex agents and coding tasks with optimal balance of intelligence, speed, and cost',
        contextWindow: 200000,
        capabilities: ['streaming', 'tool-use', 'vision', 'file-access', 'multi-turn'],
        isAvailable: true,
        isDefault: true,
        costTier: 'medium' as const,
      },
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        description: 'Most intelligent model with 80.9% SWE-bench score, best for complex reasoning',
        contextWindow: 200000,
        capabilities: ['streaming', 'tool-use', 'vision', 'file-access', 'multi-turn'],
        isAvailable: true,
        isDefault: false,
        costTier: 'high' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        description: 'Fastest model with near-frontier performance, optimized for high-volume tasks',
        contextWindow: 200000,
        capabilities: ['streaming', 'tool-use', 'vision', 'file-access', 'multi-turn'],
        isAvailable: true,
        isDefault: false,
        costTier: 'low' as const,
      },
    ],
    capabilities: {
      streaming: true,
      multiTurn: true,
      toolUse: true,
      fileAccess: true,
      customInstructions: true,
      mcpSupport: true,
      modelSelection: true,
    },
    isAvailable: true,
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    description: 'Google Gemini AI agent with massive context windows and multimodal capabilities',
    models: [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Most capable Gemini model with 1M token context and adaptive thinking',
        contextWindow: 1000000,
        capabilities: ['streaming', 'tool-use', 'vision', 'multimodal', 'audio', 'video'],
        isAvailable: true,
        isDefault: true,
        costTier: 'medium' as const,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast, efficient model with excellent multimodal capabilities',
        contextWindow: 1000000,
        capabilities: ['streaming', 'tool-use', 'vision', 'multimodal', 'audio', 'video'],
        isAvailable: true,
        isDefault: false,
        costTier: 'low' as const,
      },
    ],
    capabilities: {
      streaming: true,
      multiTurn: true,
      toolUse: true,
      fileAccess: true,
      customInstructions: false,
      mcpSupport: false,
      modelSelection: true,
    },
    isAvailable: true,
  },
};
