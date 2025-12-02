import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

/**
 * Database Service
 * Manages SQLite database connection and initialization
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    const instanceId = Math.random().toString(36).substring(7);
    console.log(`[DatabaseService#${instanceId}] CONSTRUCTOR CALLED with path: ${dbPath}`);
    (this as any).instanceId = instanceId;
  }

  /**
   * Initialize database connection and run migrations
   */
  onModuleInit(): void {
    this.connect();
    this.runMigrations();
  }

  /**
   * Close database connection on shutdown
   * With DELETE mode, no checkpoint needed - data is already on disk
   */
  onModuleDestroy(): void {
    this.close();
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Connect to database
   */
  connect(): void {
    const instanceId = (this as any).instanceId || '?';

    if (this.db) {
      console.log(`[DatabaseService#${instanceId}] Already connected to: ${this.dbPath}`);
      return; // Already connected
    }

    console.log(`[DatabaseService#${instanceId}] CONNECTING to: ${this.dbPath}, NODE_ENV: ${process.env.NODE_ENV}`);
    this.db = new Database(this.dbPath, {
      // Only enable verbose mode when explicitly requested (not in tests)
      verbose: process.env.DB_VERBOSE === 'true' ? console.log : undefined,
    });

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Use DELETE mode for simplicity and robustness (synchronous writes, single file)
    // With single-instance enforcement, we don't need WAL's concurrency benefits
    this.db.pragma('journal_mode = DELETE');

    console.log(`[DatabaseService#${instanceId}] Connected! FK=${this.db.pragma('foreign_keys', { simple: true })}, journal_mode=${this.db.pragma('journal_mode', { simple: true })}`);
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Read schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema
    this.db.exec(schema);
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * Run a transaction
   */
  transaction<T>(fn: (db: Database.Database) => T): T {
    const db = this.getDatabase();
    const transaction = db.transaction(fn);
    return transaction(db);
  }
}
