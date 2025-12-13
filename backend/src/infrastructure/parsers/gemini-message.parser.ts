import { AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Gemini Message Parser
 * Parses JSONL output from Gemini CLI
 */
export class GeminiMessageParser {
  /**
   * Parse a single JSONL line from Gemini CLI output
   * @param line - JSON string line
   * @returns Parsed agent message or null if event should be skipped
   */
  parse(line: string): AgentMessage | null {
    // Handle empty lines
    if (!line || line.trim().length === 0) {
      return null;
    }

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      // Gracefully handle invalid JSON (like warning messages)
      return null;
    }

    // Validate required fields
    if (!parsed.type) {
      return null;
    }

    const messageType = parsed.type as string;

    // Skip init events - these are session setup messages
    if (messageType === 'init') {
      return null;
    }

    // Skip result events - these are completion messages
    if (messageType === 'result') {
      return null;
    }

    // Only process message events
    if (messageType !== 'message') {
      return null;
    }

    // Validate message has required fields
    if (!parsed.role || parsed.content === undefined) {
      return null;
    }

    const role = parsed.role as string;
    const content = parsed.content as string;

    // Build agent message
    const message: AgentMessage = {
      type: role as 'assistant' | 'user',
      role: role,
      content: content,
      raw: line, // Store original JSON
      metadata: {},
    };

    // Add all extra fields to metadata
    Object.keys(parsed).forEach((key) => {
      if (key !== 'type' && key !== 'role' && key !== 'content') {
        if (message.metadata) {
          message.metadata[key] = parsed[key];
        }
      }
    });

    return message;
  }

  /**
   * Check if message indicates completion
   * @param _message - The parsed message (unused, always returns false)
   * @returns True if this is a completion message
   *
   * Note: Gemini CLI sends completion as a separate "result" event
   * which we skip in parse(), so this always returns false for parsed messages.
   */
  isComplete(_message: AgentMessage): boolean {
    // Since we skip result events in parse(), no parsed message indicates completion
    return false;
  }
}
