import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

/**
 * Stores completion frequency data for frecency-based tab completion.
 * Uses SQLite for persistence.
 */
export class FrecencyStore {
  private db: Database | null = null;
  private cache: Map<string, number> = new Map();

  constructor() {
    // Start with in-memory cache
    // SQLite persistence is enabled when initialized
  }

  /**
   * Initialize SQLite persistence from a path
   */
  initFromPath(dbPath: string): void {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS completions (
        word TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 1,
        last_used INTEGER NOT NULL
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_completions_count ON completions(count DESC)`);

    this.loadCache();
  }

  /**
   * Initialize with default path for a character
   */
  initForCharacter(characterId: string): void {
    const configDir = join(homedir(), ".config", "mud-client", "characters", characterId);
    const dbPath = join(configDir, "frecency.db");
    this.initFromPath(dbPath);
  }

  private loadCache(limit = 1000): void {
    if (!this.db) return;

    const rows = this.db
      .query<{ word: string; count: number }, [number]>(
        `SELECT word, count FROM completions ORDER BY count DESC LIMIT ?`
      )
      .all(limit);

    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.word, row.count);
    }
  }

  /**
   * Record that a completion was accepted by the user
   */
  recordAcceptance(word: string): void {
    const lowerWord = word.toLowerCase();
    const currentCount = this.cache.get(lowerWord) || 0;
    this.cache.set(lowerWord, currentCount + 1);

    if (this.db) {
      this.db.run(
        `INSERT INTO completions (word, count, last_used)
         VALUES (?, 1, ?)
         ON CONFLICT(word) DO UPDATE SET
           count = count + 1,
           last_used = ?`,
        [lowerWord, Date.now(), Date.now()]
      );
    }
  }

  /**
   * Get the acceptance count for a word
   */
  getAcceptanceCount(word: string): number {
    return this.cache.get(word.toLowerCase()) || 0;
  }

  /**
   * Get all cached acceptance counts
   */
  getAllCounts(): Map<string, number> {
    return new Map(this.cache);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
