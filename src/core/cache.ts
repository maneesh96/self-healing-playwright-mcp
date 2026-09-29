import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

export class HealingCache {
  private static dbPath = path.join(process.cwd(), 'healing-cache.db');
  private static db: Database | null = null;

  public static async getDatabase(): Promise<Database> {
    if (!this.db) {
      // Ensure the parent directory exists (though cwd is usually root)
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Enable WAL mode (Write-Ahead Logging) for better concurrency performance in parallel workers
      await this.db.exec('PRAGMA journal_mode = WAL;');

      // Create table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS healed_locators (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_selector TEXT UNIQUE,
          healed_selector TEXT,
          confidence REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    return this.db;
  }

  public static async get(originalSelector: string): Promise<{ healedSelector: string; confidence: number } | null> {
    try {
      const db = await this.getDatabase();
      const row = await db.get(
        'SELECT healed_selector, confidence FROM healed_locators WHERE original_selector = ?',
        originalSelector
      );

      if (row) {
        return {
          healedSelector: row.healed_selector,
          confidence: row.confidence
        };
      }
      return null;
    } catch (error) {
      console.error(`[Cache Error] Failed to retrieve cache for: ${originalSelector}`, error);
      return null;
    }
  }

  public static async set(originalSelector: string, healedSelector: string, confidence: number): Promise<void> {
    try {
      const db = await this.getDatabase();
      // Insert or replace to update existing records
      await db.run(
        `INSERT INTO healed_locators (original_selector, healed_selector, confidence, created_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(original_selector) DO UPDATE SET
           healed_selector = excluded.healed_selector,
           confidence = excluded.confidence,
           created_at = CURRENT_TIMESTAMP`,
        originalSelector,
        healedSelector,
        confidence
      );
    } catch (error) {
      console.error(`[Cache Error] Failed to cache healed locator: ${originalSelector} -> ${healedSelector}`, error);
    }
  }

  public static async clear(): Promise<void> {
    try {
      const db = await this.getDatabase();
      await db.exec('DELETE FROM healed_locators');
    } catch (error) {
      console.error('[Cache Error] Failed to clear cache', error);
    }
  }

  public static async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
