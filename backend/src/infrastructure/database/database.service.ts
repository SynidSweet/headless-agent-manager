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
    if (this.db) {
      return; // Already connected
    }

    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
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
