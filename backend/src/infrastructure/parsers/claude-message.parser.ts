import { AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Claude Message Parser
 * Parses JSONL output from Claude Code CLI
 */
export class ClaudeMessageParser {
  /**
   * Parse a single JSONL line from Claude Code output
   * @param line - JSON string line
   * @returns Parsed agent message
   * @throws Error if line is invalid
   */
  parse(line: string): AgentMessage {
    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate required fields
    if (!parsed.type) {
      throw new Error('Missing required field: type');
    }

    // Determine message type (handle both old and new formats)
    let messageType = parsed.type as string;

    // For result messages, map to system type for consistency
    if (messageType === 'result') {
      messageType = 'system';
    }

    // Extract content based on format
    let content: string | object = '';
    let role: string | undefined = parsed.role as string | undefined;

    if (parsed.message) {
      // New format: {"type":"assistant","message":{...}}
      const msgObj = parsed.message as Record<string, unknown>;
      if (msgObj.content) {
        const contentArray = msgObj.content as Array<{ type: string; text?: string }>;
        // Extract text from content array
        content = contentArray
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
      } else {
        content = msgObj;
      }
      role = msgObj.role as string;
    } else if (parsed.content !== undefined) {
      // Old format: {"type":"assistant","content":"..."}
      content = parsed.content as string | object;
    } else if (parsed.stats || messageType === 'system' || messageType === 'result') {
      // System/result messages may not have content
      content = '';
    } else {
      throw new Error('Missing required field: content or stats');
    }

    // Build agent message
    const message: AgentMessage = {
      type: messageType as 'assistant' | 'user' | 'system' | 'error',
      role,
      content,
      metadata: {},
    };

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
    // Old format: type=system, role=result
    // New format: type=system (mapped from result), subtype=success/error
    return (
      (message.type === 'system' && message.role === 'result') ||
      (message.type === 'system' && message.metadata?.subtype === 'success') ||
      (message.type === 'system' && message.metadata?.subtype === 'error')
    );
  }
}
