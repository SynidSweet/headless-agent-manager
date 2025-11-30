import { AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Content block from Claude CLI
 */
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | Record<string, unknown>[]; // For tool_result blocks
  is_error?: boolean;
  tool_use_id?: string;
}

/**
 * Claude Message Parser
 * Parses JSONL output from Claude Code CLI
 */
export class ClaudeMessageParser {
  /**
   * Parse a single JSONL line from Claude Code output
   * @param line - JSON string line
   * @returns Parsed agent message or null if event should be skipped
   * @throws Error if line is invalid JSON
   */
  parse(line: string): AgentMessage | null {
    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // **NEW FORMAT SUPPORT**: Handle stream_event wrapper from Claude CLI
    // Format: {"type":"stream_event","event":{"type":"message_start",...}}
    if (parsed.type === 'stream_event' && parsed.event) {
      const event = parsed.event as Record<string, unknown>;
      const eventType = event.type as string;

      // Skip these streaming events - they don't contain displayable content
      // Return null instead of throwing to avoid polluting error logs
      if (['message_start', 'content_block_start', 'content_block_stop', 'message_stop'].includes(eventType)) {
        return null;
      }

      // Handle content_block_delta - this contains the actual text
      if (eventType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === 'text_delta' && delta.text) {
          return {
            type: 'assistant',
            role: 'assistant',
            content: delta.text as string,
            raw: line,
            metadata: { eventType: 'content_delta' },
          };
        }
      }

      // Handle message_delta - contains usage stats
      if (eventType === 'message_delta') {
        const delta = event.delta as Record<string, unknown>;
        const usage = event.usage as Record<string, unknown> | undefined;
        return {
          type: 'system',
          role: 'system',
          content: '',
          raw: line,
          metadata: {
            eventType: 'message_delta',
            delta,
            usage,
          },
        };
      }

      // Unwrap other events and continue parsing
      if (event.type) {
        parsed = event;
      }
    }

    // Validate required fields
    if (!parsed.type) {
      throw new Error('Missing required field: type');
    }

    // Determine message type (handle both old and new formats)
    let messageType = parsed.type as string;

    // For result messages, map to response type
    if (messageType === 'result') {
      messageType = 'response';
    }

    // Extract content based on format
    let content: string | object = '';
    let role: string | undefined = parsed.role as string | undefined;
    let toolUseBlocks: ContentBlock[] = [];

    if (parsed.message) {
      // New format: {"type":"assistant","message":{...}}
      const msgObj = parsed.message as Record<string, unknown>;
      if (msgObj.content) {
        const contentArray = msgObj.content as ContentBlock[];

        // Extract text blocks
        const textParts = contentArray
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text);

        // Extract tool_use blocks
        toolUseBlocks = contentArray.filter((c) => c.type === 'tool_use');

        // Extract tool_result blocks (these are user messages with tool output)
        const toolResultBlocks = contentArray.filter((c) => c.type === 'tool_result');

        // Determine message type
        if (toolUseBlocks.length > 0) {
          messageType = 'tool';
        } else if (toolResultBlocks.length > 0) {
          // User messages contain tool results
          messageType = 'user';
        }

        // Format content based on block types
        const parts: string[] = [];

        if (textParts.length > 0) {
          parts.push(textParts.join('\n'));
        }

        // Format tool results (for user messages)
        for (const result of toolResultBlocks) {
          let resultContent = '';
          if (typeof result.content === 'string') {
            resultContent = result.content;
          } else if (Array.isArray(result.content)) {
            // Handle array of content blocks
            resultContent = result.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
          } else if (result.content) {
            resultContent = JSON.stringify(result.content);
          }

          // Show error indicator if present
          const errorPrefix = result.is_error ? '❌ Error: ' : '✓ Result: ';
          parts.push(`${errorPrefix}${resultContent}`);
        }

        // Format tool calls for display
        for (const tool of toolUseBlocks) {
          const toolInput = tool.input || {};
          const description = toolInput.description as string | undefined;
          let formattedInput = '';

          // Format input based on tool type
          if (tool.name === 'Bash' && toolInput.command) {
            formattedInput = description
              ? `${description}\n$ ${toolInput.command}`
              : `$ ${toolInput.command}`;
          } else if (tool.name === 'Read' && toolInput.file_path) {
            formattedInput = description
              ? `${description}\nReading: ${toolInput.file_path}`
              : `Reading: ${toolInput.file_path}`;
          } else if (tool.name === 'Write' && toolInput.file_path) {
            formattedInput = description
              ? `${description}\nWriting: ${toolInput.file_path}`
              : `Writing: ${toolInput.file_path}`;
          } else if (tool.name === 'Edit' && toolInput.file_path) {
            formattedInput = description
              ? `${description}\nEditing: ${toolInput.file_path}`
              : `Editing: ${toolInput.file_path}`;
          } else if (tool.name === 'Grep' && toolInput.pattern) {
            formattedInput = description
              ? `${description}\ngrep "${toolInput.pattern}"${toolInput.path ? ` ${toolInput.path}` : ''}`
              : `grep "${toolInput.pattern}"${toolInput.path ? ` ${toolInput.path}` : ''}`;
          } else if (tool.name === 'Glob' && toolInput.pattern) {
            formattedInput = description
              ? `${description}\nglob "${toolInput.pattern}"`
              : `glob "${toolInput.pattern}"`;
          } else if (tool.name === 'Task') {
            formattedInput = `Spawning agent: ${(toolInput.description || toolInput.prompt || '').toString().substring(0, 50)}...`;
          } else if (tool.name === 'TodoWrite') {
            formattedInput = description || 'Updating todo list';
          } else {
            // Generic formatting for other tools
            formattedInput = description
              ? `${description}\n${JSON.stringify(toolInput)}`
              : JSON.stringify(toolInput);
          }

          parts.push(`[${tool.name}] ${formattedInput}`);
        }

        content = parts.join('\n');
      } else {
        content = msgObj;
      }
      role = msgObj.role as string;
    } else if (parsed.content !== undefined) {
      // Old format: {"type":"assistant","content":"..."}
      content = parsed.content as string | object;
    } else if (parsed.stats || messageType === 'system' || messageType === 'response' || (messageType === 'system' && parsed.role === 'result')) {
      // System/result/response messages may not have content
      // Also handle old format where type=system and role=result
      if (messageType === 'system' && parsed.role === 'result') {
        messageType = 'response';
      }
      content = '';
    } else {
      throw new Error('Missing required field: content or stats');
    }

    // Build agent message
    const message: AgentMessage = {
      type: messageType as 'assistant' | 'user' | 'system' | 'error' | 'tool' | 'response',
      role,
      content,
      raw: line, // Store original JSON
      metadata: {},
    };

    // Add tool use blocks to metadata for detailed inspection
    if (toolUseBlocks.length > 0 && message.metadata) {
      message.metadata.tool_use = toolUseBlocks;
    }

    // Add all extra fields to metadata
    Object.keys(parsed).forEach((key) => {
      if (key !== 'type' && key !== 'role' && key !== 'content' && key !== 'message') {
        if (message.metadata) {
          message.metadata[key] = parsed[key];
        }
      }
    });

    return message;
  }

  /**
   * Check if message indicates completion
   * @param message - The parsed message
   * @returns True if this is a completion message
   */
  isComplete(message: AgentMessage): boolean {
    // New format: type=response (mapped from result)
    // Old format: type=system, role=result
    return (
      message.type === 'response' ||
      (message.type === 'system' && message.role === 'result') ||
      (message.type === 'system' && message.metadata?.subtype === 'success') ||
      (message.type === 'system' && message.metadata?.subtype === 'error')
    );
  }
}
