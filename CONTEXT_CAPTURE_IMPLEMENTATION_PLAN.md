# Estimated Context Capture - TDD Implementation Plan

## Overview

Implement a feature to capture and display the estimated context files that Claude Code loads when starting an agent. This provides transparency into what context the agent receives, while being honest about the fact that it's an estimation.

**Key Principle**: We cannot capture the actual system prompt from Claude CLI, so we reconstruct context files with clear metadata about how they were constructed for comparison purposes.

**Research-Based Accuracy**: This implementation is based on thorough research of official Claude Code documentation. We capture the EXACT files that Claude Code loads:
- CLAUDE.md files (recursive upward search from cwd to home)
- Settings files (user, project, local)
- Command and agent definitions
- MCP configuration

**Note**: Subdirectory CLAUDE.md files use lazy-loading (loaded when accessed), so we only capture files that would be loaded at startup based on the agent's working directory.

---

## Architecture Design (Clean Architecture)

### Layer Breakdown

```
┌─────────────────────────────────────────────────────┐
│ PRESENTATION LAYER                                  │
│ - AgentController (extend existing)                 │
│ - No new controllers needed                         │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ APPLICATION LAYER                                   │
│ - ContextCaptureService (NEW)                       │
│ - AgentOrchestrationService (extend)                │
│ - Ports:                                            │
│   - IFileSystemReader (NEW interface)               │
│   - IContextFileLocator (NEW interface)             │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ DOMAIN LAYER                                        │
│ - ContextFile (NEW value object)                    │
│ - ContextSource (NEW value object)                  │
│ - AgentMessage (extend with "context" type)         │
└─────────────────────────────────────────────────────┘
                       ↑
┌─────────────────────────────────────────────────────┐
│ INFRASTRUCTURE LAYER                                │
│ - NodeFileSystemAdapter (NEW)                       │
│ - ClaudeContextLocator (NEW)                        │
└─────────────────────────────────────────────────────┘
```

### SOLID Principles Application

**Single Responsibility Principle (SRP)**:
- `ContextFile`: Represents a single context file with metadata
- `ContextCaptureService`: Orchestrates context file discovery and aggregation
- `NodeFileSystemAdapter`: Only handles file I/O
- `ClaudeContextLocator`: Only handles context file path resolution

**Open/Closed Principle (OCP)**:
- `IFileSystemReader`: Interface allows swapping file reading implementations
- `IContextFileLocator`: Can add new locator strategies (e.g., global ~/.claude/CLAUDE.md)

**Liskov Substitution Principle (LSP)**:
- Any `IFileSystemReader` implementation can be used without breaking the service
- Any `IContextFileLocator` can be swapped in

**Interface Segregation Principle (ISP)**:
- `IFileSystemReader`: Small interface with only file reading methods
- `IContextFileLocator`: Focused interface for locating context files

**Dependency Inversion Principle (DIP)**:
- `ContextCaptureService` depends on abstractions (`IFileSystemReader`, `IContextFileLocator`)
- Infrastructure layer implements these abstractions

---

## Domain Models

### 1. ContextFile (Value Object)

```typescript
// src/domain/value-objects/context-file.vo.ts

export class ContextFile {
  private constructor(
    private readonly _path: string,
    private readonly _content: string,
    private readonly _source: ContextSource,
    private readonly _metadata: ContextFileMetadata,
  ) {}

  static create(data: {
    path: string;
    content: string;
    source: ContextSource;
    metadata: ContextFileMetadata;
  }): ContextFile {
    // Validation
    if (!data.path) throw new Error('Path is required');
    if (!data.content) throw new Error('Content is required');

    return new ContextFile(
      data.path,
      data.content,
      data.source,
      data.metadata,
    );
  }

  get path(): string { return this._path; }
  get content(): string { return this._content; }
  get source(): ContextSource { return this._source; }
  get metadata(): ContextFileMetadata { return this._metadata; }
}

export interface ContextFileMetadata {
  modifiedAt: Date;
  sizeBytes: number;
  sha256Hash: string; // For comparison/change detection
}
```

### 2. ContextSource (Value Object)

```typescript
// src/domain/value-objects/context-source.vo.ts

export type ContextSourceType =
  | 'global-user'       // ~/.claude/CLAUDE.md (loaded first)
  | 'parent-directory'  // ../CLAUDE.md (upward recursion)
  | 'project-root'      // ./CLAUDE.md or ./.claude/CLAUDE.md
  | 'project-settings'  // ./.claude/settings.json
  | 'project-local'     // ./.claude/settings.local.json
  | 'user-settings'     // ~/.claude/settings.json
  | 'mcp-config'        // ./.mcp.json
  | 'commands'          // ./.claude/commands/*.md
  | 'agents';           // ./.claude/agents/*.md

export class ContextSource {
  private constructor(
    private readonly _type: ContextSourceType,
    private readonly _priority: number,
    private readonly _description: string,
  ) {}

  static globalUser(): ContextSource {
    return new ContextSource('global-user', 1, 'User global memory');
  }

  static parentDirectory(depth: number): ContextSource {
    return new ContextSource('parent-directory', 2 + depth, `Parent directory (${depth} levels up)`);
  }

  static projectRoot(): ContextSource {
    return new ContextSource('project-root', 100, 'Project root memory');
  }

  static projectSettings(): ContextSource {
    return new ContextSource('project-settings', 101, 'Project settings');
  }

  static projectLocal(): ContextSource {
    return new ContextSource('project-local', 102, 'Local project settings');
  }

  static userSettings(): ContextSource {
    return new ContextSource('user-settings', 0, 'User settings');
  }

  static mcpConfig(): ContextSource {
    return new ContextSource('mcp-config', 103, 'MCP server configuration');
  }

  static commands(): ContextSource {
    return new ContextSource('commands', 104, 'Slash commands');
  }

  static agents(): ContextSource {
    return new ContextSource('agents', 105, 'Subagent definitions');
  }

  get type(): ContextSourceType { return this._type; }
  get priority(): number { return this._priority; }
  get description(): string { return this._description; }
}
```

### 3. AgentMessage Extension

```typescript
// src/application/ports/agent-runner.port.ts

export interface AgentMessage {
  type: 'assistant' | 'user' | 'system' | 'error' | 'tool' | 'response' | 'context'; // ← Add 'context'
  role?: string;
  content: string | object;
  raw?: string; // For context messages: JSON metadata
  metadata?: Record<string, unknown>;
}
```

---

## Application Layer Ports

### 1. IFileSystemReader

```typescript
// src/application/ports/filesystem-reader.port.ts

export interface IFileSystemReader {
  /**
   * Read a file's contents
   */
  readFile(path: string): Promise<string>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file metadata (size, modified time, etc.)
   */
  getMetadata(path: string): Promise<FileMetadata>;

  /**
   * Calculate SHA-256 hash of file
   */
  calculateHash(path: string): Promise<string>;
}

export interface FileMetadata {
  modifiedAt: Date;
  sizeBytes: number;
}
```

### 2. IContextFileLocator

```typescript
// src/application/ports/context-file-locator.port.ts

export interface IContextFileLocator {
  /**
   * Locate all context files for a given working directory
   * Returns paths in priority order
   */
  locateContextFiles(workingDirectory: string): Promise<ContextFileLocation[]>;
}

export interface ContextFileLocation {
  path: string;
  source: ContextSource;
  filename: string; // e.g., 'CLAUDE.md', 'PROJECT_CONTEXT.md'
}
```

---

## Application Service

### ContextCaptureService

```typescript
// src/application/services/context-capture.service.ts

export class ContextCaptureService {
  constructor(
    private readonly fileSystemReader: IFileSystemReader,
    private readonly contextLocator: IContextFileLocator,
    private readonly logger: ILogger,
  ) {}

  /**
   * Capture all context files for an agent's working directory
   * Returns an AgentMessage of type 'context'
   */
  async captureContext(workingDirectory: string): Promise<AgentMessage> {
    // 1. Locate context files
    const locations = await this.contextLocator.locateContextFiles(workingDirectory);

    // 2. Read each file
    const contextFiles: ContextFile[] = [];
    for (const location of locations) {
      try {
        const exists = await this.fileSystemReader.exists(location.path);
        if (!exists) continue;

        const content = await this.fileSystemReader.readFile(location.path);
        const metadata = await this.fileSystemReader.getMetadata(location.path);
        const hash = await this.fileSystemReader.calculateHash(location.path);

        const contextFile = ContextFile.create({
          path: location.path,
          content,
          source: location.source,
          metadata: {
            modifiedAt: metadata.modifiedAt,
            sizeBytes: metadata.sizeBytes,
            sha256Hash: hash,
          },
        });

        contextFiles.push(contextFile);
      } catch (error) {
        this.logger.warn('Failed to read context file', {
          path: location.path,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // 3. Construct AgentMessage
    return this.buildContextMessage(contextFiles, workingDirectory);
  }

  private buildContextMessage(
    files: ContextFile[],
    workingDirectory: string,
  ): AgentMessage {
    // Content: Concatenated context files with headers
    const content = files
      .map(file => {
        return `# ${file.path}\n\n${file.content}\n\n---\n`;
      })
      .join('\n');

    // Raw JSON: Metadata about construction
    const rawMetadata = {
      type: 'context_estimation',
      workingDirectory,
      capturedAt: new Date().toISOString(),
      disclaimer: 'This is an estimation of context files loaded by Claude Code. The actual system prompt may include additional content not shown here.',
      files: files.map(file => ({
        path: file.path,
        source: file.source.type,
        modifiedAt: file.metadata.modifiedAt.toISOString(),
        sizeBytes: file.metadata.sizeBytes,
        sha256Hash: file.metadata.sha256Hash,
      })),
      totalFiles: files.length,
      totalSizeBytes: files.reduce((sum, f) => sum + f.metadata.sizeBytes, 0),
    };

    return {
      type: 'context',
      role: 'system',
      content: content || '(No context files found)',
      raw: JSON.stringify(rawMetadata),
      metadata: {
        contextFileCount: files.length,
        workingDirectory,
      },
    };
  }
}
```

---

## Infrastructure Implementations

### 1. NodeFileSystemAdapter

```typescript
// src/infrastructure/adapters/node-filesystem.adapter.ts

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { IFileSystemReader, FileMetadata } from '@application/ports/filesystem-reader.port';

export class NodeFileSystemAdapter implements IFileSystemReader {
  async readFile(path: string): Promise<string> {
    return await fs.readFile(path, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const stats = await fs.stat(path);
    return {
      modifiedAt: stats.mtime,
      sizeBytes: stats.size,
    };
  }

  async calculateHash(path: string): Promise<string> {
    const content = await fs.readFile(path);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
```

### 2. ClaudeContextLocator

```typescript
// src/infrastructure/adapters/claude-context-locator.adapter.ts

import * as path from 'path';
import { IContextFileLocator, ContextFileLocation } from '@application/ports/context-file-locator.port';
import { ContextSource } from '@domain/value-objects/context-source.vo';

export class ClaudeContextLocator implements IContextFileLocator {
  /**
   * Locate all context files that Claude Code would load for a given working directory.
   * Based on official Claude Code documentation, this includes:
   * 1. User global CLAUDE.md (~/.claude/CLAUDE.md)
   * 2. Upward recursive search for CLAUDE.md (from cwd to home)
   * 3. Settings files (user, project, local)
   * 4. MCP configuration (./.mcp.json)
   * 5. Commands and agents (./.claude/commands/, ./.claude/agents/)
   */
  async locateContextFiles(workingDirectory: string): Promise<ContextFileLocation[]> {
    const locations: ContextFileLocation[] = [];
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    // 1. User global settings (loaded first, lowest priority)
    if (homeDir) {
      locations.push({
        path: path.join(homeDir, '.claude', 'settings.json'),
        source: ContextSource.userSettings(),
        filename: 'settings.json',
      });
    }

    // 2. User global memory (loaded first for CLAUDE.md files)
    if (homeDir) {
      locations.push({
        path: path.join(homeDir, '.claude', 'CLAUDE.md'),
        source: ContextSource.globalUser(),
        filename: 'CLAUDE.md',
      });
    }

    // 3. Upward recursive search for CLAUDE.md (from cwd to home)
    // Claude Code searches parent directories up to home directory
    const claudeMdLocations = this.searchUpwardForClaudeMd(workingDirectory, homeDir);
    locations.push(...claudeMdLocations);

    // 4. Project root CLAUDE.md (both possible locations)
    locations.push({
      path: path.join(workingDirectory, 'CLAUDE.md'),
      source: ContextSource.projectRoot(),
      filename: 'CLAUDE.md',
    });
    locations.push({
      path: path.join(workingDirectory, '.claude', 'CLAUDE.md'),
      source: ContextSource.projectRoot(),
      filename: '.claude/CLAUDE.md',
    });

    // 5. Project settings files
    locations.push({
      path: path.join(workingDirectory, '.claude', 'settings.json'),
      source: ContextSource.projectSettings(),
      filename: 'settings.json',
    });
    locations.push({
      path: path.join(workingDirectory, '.claude', 'settings.local.json'),
      source: ContextSource.projectLocal(),
      filename: 'settings.local.json',
    });

    // 6. MCP configuration
    locations.push({
      path: path.join(workingDirectory, '.mcp.json'),
      source: ContextSource.mcpConfig(),
      filename: '.mcp.json',
    });

    // 7. User commands and agents
    if (homeDir) {
      locations.push({
        path: path.join(homeDir, '.claude', 'commands'),
        source: ContextSource.commands(),
        filename: 'commands/',
      });
      locations.push({
        path: path.join(homeDir, '.claude', 'agents'),
        source: ContextSource.agents(),
        filename: 'agents/',
      });
    }

    // 8. Project commands and agents
    locations.push({
      path: path.join(workingDirectory, '.claude', 'commands'),
      source: ContextSource.commands(),
      filename: 'commands/',
    });
    locations.push({
      path: path.join(workingDirectory, '.claude', 'agents'),
      source: ContextSource.agents(),
      filename: 'agents/',
    });

    // Sort by priority (lower priority number = loaded first)
    return locations.sort((a, b) => a.source.priority - b.source.priority);
  }

  /**
   * Search upward for CLAUDE.md files from working directory to home directory.
   * Mimics Claude Code's upward recursive search behavior.
   */
  private searchUpwardForClaudeMd(
    workingDirectory: string,
    homeDir: string,
  ): ContextFileLocation[] {
    const locations: ContextFileLocation[] = [];
    let currentDir = path.dirname(workingDirectory); // Start from parent
    let depth = 0;

    // Search upward until we reach home directory
    while (currentDir !== homeDir && currentDir !== '/' && depth < 10) {
      // Check for CLAUDE.md in current directory
      locations.push({
        path: path.join(currentDir, 'CLAUDE.md'),
        source: ContextSource.parentDirectory(depth),
        filename: 'CLAUDE.md',
      });

      // Check for .claude/CLAUDE.md in current directory
      locations.push({
        path: path.join(currentDir, '.claude', 'CLAUDE.md'),
        source: ContextSource.parentDirectory(depth),
        filename: '.claude/CLAUDE.md',
      });

      // Move up one directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached filesystem root
      currentDir = parentDir;
      depth++;
    }

    return locations;
  }
}
```

---

## Integration with Agent Orchestration

### AgentOrchestrationService Extension

```typescript
// src/application/services/agent-orchestration.service.ts

export class AgentOrchestrationService {
  constructor(
    // ... existing dependencies
    private readonly contextCaptureService: ContextCaptureService, // NEW
  ) {}

  async launchAgent(request: LaunchAgentRequest): Promise<Agent> {
    // 1. Create agent (existing code)
    const agent = Agent.create({ ... });

    // 2. Start runner (existing code)
    const runner = this.agentFactory.create(request.type);
    await runner.start(agent.session);

    // 3. Subscribe to streaming (existing code)
    runner.subscribe(agent.id, {
      onMessage: (message) => {
        // Handle init message
        if (message.type === 'system' && message.metadata?.subtype === 'init') {
          // Extract cwd from init message
          const cwd = message.metadata.cwd as string;

          // Capture context asynchronously (don't block agent start)
          this.captureAndEmitContext(agent.id, cwd);
        }

        // Existing message handling
        this.streamingService.broadcastMessage(agent.id, message);
      },
      // ... other handlers
    });

    return agent;
  }

  private async captureAndEmitContext(agentId: AgentId, cwd: string): Promise<void> {
    try {
      const contextMessage = await this.contextCaptureService.captureContext(cwd);

      // Emit as a regular message
      this.streamingService.broadcastMessage(agentId, contextMessage);

      // Persist to database (uses existing message persistence)
      await this.agentMessageService.saveMessage(agentId, contextMessage);

    } catch (error) {
      this.logger.error('Failed to capture context', {
        agentId: agentId.toString(),
        cwd,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
}
```

---

## TDD Test Plan (Red-Green-Refactor)

### Phase 1: Domain Layer Tests (100% coverage required)

#### Test File: `test/unit/domain/value-objects/context-file.vo.spec.ts`

```typescript
describe('ContextFile', () => {
  describe('create', () => {
    it('should create a valid context file', () => {
      // RED: Write test first (will fail)
      const contextFile = ContextFile.create({
        path: '/project/CLAUDE.md',
        content: '# Test content',
        source: ContextSource.projectRoot(),
        metadata: {
          modifiedAt: new Date('2025-11-30'),
          sizeBytes: 100,
          sha256Hash: 'abc123',
        },
      });

      expect(contextFile.path).toBe('/project/CLAUDE.md');
      expect(contextFile.content).toBe('# Test content');
    });

    it('should throw error when path is missing', () => {
      expect(() => {
        ContextFile.create({
          path: '',
          content: 'test',
          source: ContextSource.projectRoot(),
          metadata: { ... },
        });
      }).toThrow('Path is required');
    });

    it('should throw error when content is missing', () => {
      expect(() => {
        ContextFile.create({
          path: '/test',
          content: '',
          source: ContextSource.projectRoot(),
          metadata: { ... },
        });
      }).toThrow('Content is required');
    });
  });
});
```

#### Test File: `test/unit/domain/value-objects/context-source.vo.spec.ts`

```typescript
describe('ContextSource', () => {
  it('should create project root source with priority 1', () => {
    const source = ContextSource.projectRoot();
    expect(source.type).toBe('project-root');
    expect(source.priority).toBe(1);
  });

  it('should create global config source with priority 2', () => {
    const source = ContextSource.globalConfig();
    expect(source.type).toBe('global-config');
    expect(source.priority).toBe(2);
  });

  it('should prioritize project root over global config', () => {
    const projectRoot = ContextSource.projectRoot();
    const globalConfig = ContextSource.globalConfig();
    expect(projectRoot.priority).toBeLessThan(globalConfig.priority);
  });
});
```

### Phase 2: Infrastructure Layer Tests

#### Test File: `test/unit/infrastructure/adapters/node-filesystem.adapter.spec.ts`

```typescript
describe('NodeFileSystemAdapter', () => {
  let adapter: NodeFileSystemAdapter;
  let tempDir: string;

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  describe('readFile', () => {
    it('should read file contents', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');

      const content = await adapter.readFile(filePath);
      expect(content).toBe('test content');
    });

    it('should throw error when file does not exist', async () => {
      await expect(
        adapter.readFile('/nonexistent/file.txt')
      ).rejects.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'test');

      const exists = await adapter.exists(filePath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const exists = await adapter.exists('/nonexistent/file.txt');
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return correct file metadata', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'test content';
      await fs.writeFile(filePath, content);

      const metadata = await adapter.getMetadata(filePath);
      expect(metadata.sizeBytes).toBe(content.length);
      expect(metadata.modifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('calculateHash', () => {
    it('should calculate SHA-256 hash correctly', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');

      const hash = await adapter.calculateHash(filePath);

      // Verify hash is 64 hex characters (SHA-256)
      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify hash is consistent
      const hash2 = await adapter.calculateHash(filePath);
      expect(hash).toBe(hash2);
    });

    it('should produce different hashes for different content', async () => {
      const file1 = path.join(tempDir, 'test1.txt');
      const file2 = path.join(tempDir, 'test2.txt');
      await fs.writeFile(file1, 'content 1');
      await fs.writeFile(file2, 'content 2');

      const hash1 = await adapter.calculateHash(file1);
      const hash2 = await adapter.calculateHash(file2);
      expect(hash1).not.toBe(hash2);
    });
  });
});
```

#### Test File: `test/unit/infrastructure/adapters/claude-context-locator.adapter.spec.ts`

```typescript
describe('ClaudeContextLocator', () => {
  let locator: ClaudeContextLocator;

  beforeEach(() => {
    locator = new ClaudeContextLocator();
  });

  describe('locateContextFiles', () => {
    it('should locate project-level CLAUDE.md', async () => {
      const locations = await locator.locateContextFiles('/project');

      const claudeMd = locations.find(l => l.filename === 'CLAUDE.md');
      expect(claudeMd).toBeDefined();
      expect(claudeMd?.path).toBe('/project/CLAUDE.md');
      expect(claudeMd?.source.type).toBe('project-root');
    });

    it('should locate PROJECT_CONTEXT.md', async () => {
      const locations = await locator.locateContextFiles('/project');

      const projectContext = locations.find(l => l.filename === 'PROJECT_CONTEXT.md');
      expect(projectContext).toBeDefined();
      expect(projectContext?.path).toBe('/project/PROJECT_CONTEXT.md');
    });

    it('should include global config location', async () => {
      const locations = await locator.locateContextFiles('/project');

      const globalConfig = locations.find(
        l => l.source.type === 'global-config'
      );
      expect(globalConfig).toBeDefined();
      expect(globalConfig?.path).toContain('.claude/CLAUDE.md');
    });

    it('should sort locations by priority', async () => {
      const locations = await locator.locateContextFiles('/project');

      // Project-level should come before global config
      const priorities = locations.map(l => l.source.priority);
      const sorted = [...priorities].sort((a, b) => a - b);
      expect(priorities).toEqual(sorted);
    });
  });
});
```

### Phase 3: Application Layer Tests

#### Test File: `test/unit/application/services/context-capture.service.spec.ts`

```typescript
describe('ContextCaptureService', () => {
  let service: ContextCaptureService;
  let mockFileSystemReader: jest.Mocked<IFileSystemReader>;
  let mockContextLocator: jest.Mocked<IContextFileLocator>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockFileSystemReader = {
      readFile: jest.fn(),
      exists: jest.fn(),
      getMetadata: jest.fn(),
      calculateHash: jest.fn(),
    };

    mockContextLocator = {
      locateContextFiles: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    service = new ContextCaptureService(
      mockFileSystemReader,
      mockContextLocator,
      mockLogger,
    );
  });

  describe('captureContext', () => {
    it('should capture context files and build message', async () => {
      // Arrange
      const workingDirectory = '/project';
      const locations: ContextFileLocation[] = [
        {
          path: '/project/CLAUDE.md',
          source: ContextSource.projectRoot(),
          filename: 'CLAUDE.md',
        },
      ];

      mockContextLocator.locateContextFiles.mockResolvedValue(locations);
      mockFileSystemReader.exists.mockResolvedValue(true);
      mockFileSystemReader.readFile.mockResolvedValue('# Claude Context');
      mockFileSystemReader.getMetadata.mockResolvedValue({
        modifiedAt: new Date('2025-11-30'),
        sizeBytes: 100,
      });
      mockFileSystemReader.calculateHash.mockResolvedValue('abc123hash');

      // Act
      const message = await service.captureContext(workingDirectory);

      // Assert
      expect(message.type).toBe('context');
      expect(message.content).toContain('# Claude Context');
      expect(message.raw).toBeDefined();

      const raw = JSON.parse(message.raw as string);
      expect(raw.type).toBe('context_estimation');
      expect(raw.files).toHaveLength(1);
      expect(raw.files[0].path).toBe('/project/CLAUDE.md');
      expect(raw.files[0].sha256Hash).toBe('abc123hash');
    });

    it('should skip non-existent files', async () => {
      // Arrange
      const locations: ContextFileLocation[] = [
        {
          path: '/project/CLAUDE.md',
          source: ContextSource.projectRoot(),
          filename: 'CLAUDE.md',
        },
        {
          path: '/project/MISSING.md',
          source: ContextSource.projectRoot(),
          filename: 'MISSING.md',
        },
      ];

      mockContextLocator.locateContextFiles.mockResolvedValue(locations);
      mockFileSystemReader.exists
        .mockResolvedValueOnce(true)  // CLAUDE.md exists
        .mockResolvedValueOnce(false); // MISSING.md doesn't exist
      mockFileSystemReader.readFile.mockResolvedValue('# Content');
      mockFileSystemReader.getMetadata.mockResolvedValue({
        modifiedAt: new Date(),
        sizeBytes: 100,
      });
      mockFileSystemReader.calculateHash.mockResolvedValue('hash');

      // Act
      const message = await service.captureContext('/project');

      // Assert
      const raw = JSON.parse(message.raw as string);
      expect(raw.files).toHaveLength(1);
      expect(raw.files[0].path).toBe('/project/CLAUDE.md');
    });

    it('should handle file read errors gracefully', async () => {
      // Arrange
      const locations: ContextFileLocation[] = [
        {
          path: '/project/CLAUDE.md',
          source: ContextSource.projectRoot(),
          filename: 'CLAUDE.md',
        },
      ];

      mockContextLocator.locateContextFiles.mockResolvedValue(locations);
      mockFileSystemReader.exists.mockResolvedValue(true);
      mockFileSystemReader.readFile.mockRejectedValue(
        new Error('Permission denied')
      );

      // Act
      const message = await service.captureContext('/project');

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to read context file',
        expect.objectContaining({
          path: '/project/CLAUDE.md',
          error: 'Permission denied',
        })
      );

      const raw = JSON.parse(message.raw as string);
      expect(raw.files).toHaveLength(0);
    });

    it('should include disclaimer in raw metadata', async () => {
      mockContextLocator.locateContextFiles.mockResolvedValue([]);

      const message = await service.captureContext('/project');

      const raw = JSON.parse(message.raw as string);
      expect(raw.disclaimer).toContain('estimation');
      expect(raw.disclaimer).toContain('actual system prompt may include additional content');
    });

    it('should calculate total size correctly', async () => {
      // Arrange
      const locations: ContextFileLocation[] = [
        {
          path: '/project/FILE1.md',
          source: ContextSource.projectRoot(),
          filename: 'FILE1.md',
        },
        {
          path: '/project/FILE2.md',
          source: ContextSource.projectRoot(),
          filename: 'FILE2.md',
        },
      ];

      mockContextLocator.locateContextFiles.mockResolvedValue(locations);
      mockFileSystemReader.exists.mockResolvedValue(true);
      mockFileSystemReader.readFile.mockResolvedValue('content');
      mockFileSystemReader.getMetadata
        .mockResolvedValueOnce({ modifiedAt: new Date(), sizeBytes: 100 })
        .mockResolvedValueOnce({ modifiedAt: new Date(), sizeBytes: 200 });
      mockFileSystemReader.calculateHash.mockResolvedValue('hash');

      // Act
      const message = await service.captureContext('/project');

      // Assert
      const raw = JSON.parse(message.raw as string);
      expect(raw.totalSizeBytes).toBe(300);
    });
  });
});
```

### Phase 4: Integration Tests

#### Test File: `test/integration/context-capture.integration.spec.ts`

```typescript
describe('Context Capture Integration', () => {
  let app: INestApplication;
  let contextCaptureService: ContextCaptureService;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory with test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integration-'));

    await fs.writeFile(
      path.join(tempDir, 'CLAUDE.md'),
      '# Test Claude Context\n\nThis is a test.'
    );

    await fs.writeFile(
      path.join(tempDir, 'PROJECT_CONTEXT.md'),
      '# Project Context\n\nProject details here.'
    );

    // Initialize NestJS app with real implementations
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    contextCaptureService = app.get(ContextCaptureService);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
    await app.close();
  });

  it('should capture real context files from temp directory', async () => {
    const message = await contextCaptureService.captureContext(tempDir);

    // Verify message structure
    expect(message.type).toBe('context');
    expect(message.content).toContain('Test Claude Context');
    expect(message.content).toContain('Project Context');

    // Verify raw metadata
    const raw = JSON.parse(message.raw as string);
    expect(raw.files.length).toBeGreaterThanOrEqual(2);

    const claudeMd = raw.files.find((f: any) => f.path.endsWith('CLAUDE.md'));
    expect(claudeMd).toBeDefined();
    expect(claudeMd.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should persist context message to database', async () => {
    // Launch agent and capture context
    const launchResponse = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'synthetic',
        prompt: 'test',
        configuration: {},
      })
      .expect(201);

    const agentId = launchResponse.body.agentId;

    // Wait for context capture
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Fetch messages
    const messagesResponse = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}/messages`)
      .expect(200);

    const messages = messagesResponse.body;
    const contextMessage = messages.find((m: any) => m.type === 'context');

    expect(contextMessage).toBeDefined();
    expect(contextMessage.raw).toBeDefined();

    const raw = JSON.parse(contextMessage.raw);
    expect(raw.type).toBe('context_estimation');
  });
});
```

### Phase 5: E2E Tests

#### Test File: `test/e2e/context-capture.e2e.spec.ts`

```typescript
describe('Context Capture E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should emit context message after init message', (done) => {
    const client = io('http://localhost:3000', {
      transports: ['websocket'],
    });

    const messages: any[] = [];

    client.on('agent:message', (data: any) => {
      messages.push(data);

      // Check if we received both init and context messages
      const hasInit = messages.some(m => m.type === 'system' && m.metadata?.subtype === 'init');
      const hasContext = messages.some(m => m.type === 'context');

      if (hasInit && hasContext) {
        const contextMsg = messages.find(m => m.type === 'context');
        expect(contextMsg.raw).toBeDefined();
        expect(JSON.parse(contextMsg.raw).type).toBe('context_estimation');

        client.disconnect();
        done();
      }
    });

    // Launch agent
    request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'synthetic',
        prompt: 'test',
        configuration: {},
      })
      .then(response => {
        client.emit('subscribe', { agentId: response.body.agentId });
      });
  }, 10000);
});
```

---

## Implementation Phases

### Phase 1: Domain Layer (2-3 hours)
**RED → GREEN → REFACTOR**

1. Write tests for `ContextFile` (RED)
2. Implement `ContextFile` (GREEN)
3. Refactor for clarity (REFACTOR)
4. Write tests for `ContextSource` (RED)
5. Implement `ContextSource` (GREEN)
6. Refactor if needed (REFACTOR)

**Success Criteria**: 100% domain layer test coverage

### Phase 2: Infrastructure Layer (3-4 hours)

1. Write tests for `NodeFileSystemAdapter` (RED)
2. Implement `NodeFileSystemAdapter` (GREEN)
3. Write tests for `ClaudeContextLocator` (RED)
4. Implement `ClaudeContextLocator` (GREEN)
5. Refactor both adapters (REFACTOR)

**Success Criteria**: All infrastructure tests pass, 95%+ coverage

### Phase 3: Application Layer (4-5 hours)

1. Write ports (interfaces) - no tests needed for interfaces
2. Write tests for `ContextCaptureService` (RED)
3. Implement `ContextCaptureService` (GREEN)
4. Refactor service (REFACTOR)
5. Write tests for `AgentOrchestrationService` extension (RED)
6. Implement integration with orchestration (GREEN)

**Success Criteria**: All application tests pass, 90%+ coverage

### Phase 4: Integration (2-3 hours)

1. Wire up dependency injection in `InfrastructureModule`
2. Wire up in `ApplicationModule`
3. Write integration tests (RED)
4. Fix any integration issues (GREEN)
5. Refactor module configurations (REFACTOR)

**Success Criteria**: Integration tests pass, services properly injected

### Phase 5: E2E Validation (1-2 hours)

1. Write E2E test for WebSocket emission (RED)
2. Verify context message appears in frontend (GREEN)
3. Test with real Claude CLI agent (SMOKE TEST)

**Success Criteria**: Context message appears in frontend after agent launch

### Phase 6: Frontend Display (3-4 hours)

1. Extend `AgentMessage` type in frontend
2. Add context message rendering in `AgentOutput` component
3. Write component tests for context display
4. Add collapsible UI for context content
5. Display raw JSON metadata nicely

**Success Criteria**: Context message displays beautifully in UI

---

## Success Criteria

### Functional Requirements
✅ Context files are captured when agent starts
✅ Context message includes CLAUDE.md, PROJECT_CONTEXT.md, .claude/CLAUDE.md
✅ Context message includes global ~/.claude/CLAUDE.md
✅ Message content contains concatenated file contents
✅ Raw JSON contains metadata (paths, hashes, sizes, timestamps)
✅ Missing files are skipped gracefully
✅ File read errors are logged but don't crash
✅ Context message persists to database
✅ Context message streams to frontend via WebSocket

### Non-Functional Requirements
✅ **Test Coverage**: 90%+ overall, 100% domain layer
✅ **SOLID Compliance**: Each class has single responsibility, depends on abstractions
✅ **Clean Architecture**: Clear layer separation, dependency inversion
✅ **Performance**: Context capture completes in <500ms for typical projects
✅ **Error Handling**: No crashes, all errors logged gracefully
✅ **Documentation**: Clear disclaimers about estimation

### Testing Requirements
✅ 150+ unit tests across all layers
✅ 10+ integration tests with real file system
✅ 3+ E2E tests with real backend
✅ 1 smoke test with real Claude CLI

---

## Estimated Timeline

| Phase | Hours | Cumulative |
|-------|-------|------------|
| Phase 1: Domain Layer | 2-3 | 2-3 |
| Phase 2: Infrastructure | 3-4 | 5-7 |
| Phase 3: Application | 4-5 | 9-12 |
| Phase 4: Integration | 2-3 | 11-15 |
| Phase 5: E2E Validation | 1-2 | 12-17 |
| Phase 6: Frontend Display | 3-4 | 15-21 |

**Total Estimated Time**: 15-21 hours (2-3 days of focused work)

---

## Next Steps

1. **Review this plan** - Verify architecture aligns with project standards
2. **Start Phase 1** - Begin with domain layer tests and implementation
3. **Daily checkpoints** - Review progress after each phase
4. **Adjust timeline** - Update estimates based on actual progress

Ready to begin implementation?

---

## Appendix: Research Findings on Claude Code Context Loading

### Complete List of Files Claude Code Loads (Officially Documented)

Based on thorough research of official Claude Code documentation:

**1. CLAUDE.md Files (Memory System)**
- `~/.claude/CLAUDE.md` - Global user memory (always loaded)
- Upward recursive search from cwd to home directory
- `./CLAUDE.md` or `./.claude/CLAUDE.md` - Project memory
- Subdirectory CLAUDE.md files (lazy-loaded when accessed)

**2. Settings Files**
- `~/.claude/settings.json` - User settings
- `./.claude/settings.json` - Project settings (git-tracked)
- `./.claude/settings.local.json` - Personal project settings (git-ignored)
- Enterprise managed settings (platform-specific paths)

**3. Commands & Agents**
- `~/.claude/commands/*.md` - User slash commands
- `./.claude/commands/*.md` - Project slash commands
- `~/.claude/agents/*.md` - User subagents
- `./.claude/agents/*.md` - Project subagents

**4. MCP Configuration**
- `./.mcp.json` - Project MCP servers
- User MCP configuration (in user settings)

### Key Behaviors

**Upward Recursive Search**:
- Searches from cwd up to home directory (stops at home, doesn't go to filesystem root)
- Each parent directory's CLAUDE.md is loaded
- Example: Running from `~/projects/myapp/backend/` loads:
  1. `~/.claude/CLAUDE.md`
  2. `~/projects/CLAUDE.md` (if exists)
  3. `~/projects/myapp/CLAUDE.md` (if exists)
  4. `~/projects/myapp/backend/CLAUDE.md`

**Lazy Loading**:
- Subdirectory CLAUDE.md files only load when agent accesses those directories
- At startup, only loads files in the upward path from cwd to home

**Settings Hierarchy** (highest to lowest priority):
1. Command-line arguments (temporary override)
2. Enterprise managed policies (cannot be overridden)
3. Local project settings (`./.claude/settings.local.json`)
4. Shared project settings (`./.claude/settings.json`)
5. User settings (`~/.claude/settings.json`)

### Files NOT Part of Standard Context

- `PROJECT_CONTEXT.md` - Custom file (not Claude Code standard)
- Source code files - Loaded on-demand only
- Documentation files - Loaded only when referenced
- Any other custom markdown files - Not automatically loaded

### Implementation Impact

Our context capture should:
1. ✅ Search upward for CLAUDE.md from cwd to home
2. ✅ Include all settings files (user, project, local)
3. ✅ Include MCP configuration
4. ✅ Include commands and agents directories
5. ✅ Handle directories (commands/, agents/) by reading all .md files within
6. ✅ Skip files that don't exist (graceful handling)
7. ✅ Provide clear metadata about what was found vs what was searched for
