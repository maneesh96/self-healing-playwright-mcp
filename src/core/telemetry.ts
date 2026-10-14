import { HealingCache } from './cache';

export interface TelemetryEvent {
  id?: number;
  testName: string;
  originalSelector: string;
  healedSelector: string;
  confidence: number;
  reasoning: string;
  timestamp: string;
}

export class TelemetryStore {
  private static tableInitialized = false;

  private static async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;

    try {
      const db = await HealingCache.getDatabase();
      await db.exec(`
        CREATE TABLE IF NOT EXISTS telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          test_name TEXT,
          original_selector TEXT,
          healed_selector TEXT,
          confidence REAL,
          reasoning TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.tableInitialized = true;
    } catch (error) {
      console.error('[TelemetryStore Error] Failed to initialize telemetry table:', error);
    }
  }

  public static async logEvent(event: Omit<TelemetryEvent, 'timestamp'>): Promise<void> {
    try {
      await this.ensureTable();
      const db = await HealingCache.getDatabase();
      await db.run(
        `INSERT INTO telemetry (test_name, original_selector, healed_selector, confidence, reasoning, timestamp)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        event.testName,
        event.originalSelector,
        event.healedSelector,
        event.confidence,
        event.reasoning
      );
    } catch (error) {
      console.error('[TelemetryStore Error] Failed to log telemetry event:', error);
    }
  }

  public static async getEvents(): Promise<TelemetryEvent[]> {
    try {
      await this.ensureTable();
      const db = await HealingCache.getDatabase();
      const rows = await db.all('SELECT * FROM telemetry ORDER BY timestamp DESC');
      
      return rows.map((row: any) => ({
        id: row.id,
        testName: row.test_name,
        originalSelector: row.original_selector,
        healedSelector: row.healed_selector,
        confidence: row.confidence,
        reasoning: row.reasoning,
        timestamp: row.timestamp,
      }));
    } catch (error) {
      console.error('[TelemetryStore Error] Failed to retrieve telemetry events:', error);
      return [];
    }
  }

  public static async clear(): Promise<void> {
    try {
      await this.ensureTable();
      const db = await HealingCache.getDatabase();
      await db.exec('DELETE FROM telemetry');
    } catch (error) {
      console.error('[TelemetryStore Error] Failed to clear telemetry store:', error);
    }
  }
}
