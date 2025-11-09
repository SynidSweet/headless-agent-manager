-- Agent Management Database Schema
-- SQLite database for persistent agent storage

-- Agents table
-- Stores agent instances and their lifecycle information
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  configuration TEXT, -- JSON serialized configuration
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  error_name TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);

-- Agent messages table (optional - for future session history)
-- Stores individual messages from agent conversations
CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'assistant', 'user', 'system', 'error'
  role TEXT,
  content TEXT NOT NULL,
  metadata TEXT, -- JSON serialized metadata
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Indexes for message queries
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON agent_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON agent_messages(created_at);
