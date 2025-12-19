import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

export class CommandHistory {
  private history: string[] = [];
  private position = -1;
  private db: Database | null = null;
  private characterId: string | null = null;

  constructor() {
    // Start with in-memory history
    // SQLite persistence is enabled when a character is loaded
  }

  /**
   * Initialize SQLite persistence from a path
   */
  initFromPath(dbPath: string): void {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Create table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        session_id TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_history_command ON history(command)`);

    // Load recent history into memory
    this.loadRecentHistory();
  }

  /**
   * Initialize SQLite persistence for a character (legacy method)
   */
  initForCharacter(characterId: string): void {
    const configDir = join(homedir(), ".config", "mud-client", "characters", characterId);
    const dbPath = join(configDir, "history.db");
    this.initFromPath(dbPath);
  }

  private loadRecentHistory(limit = 1000): void {
    if (!this.db) return;

    const rows = this.db
      .query<{ command: string }, [number]>(`SELECT command FROM history ORDER BY timestamp DESC LIMIT ?`)
      .all(limit);

    // Reverse to get chronological order
    this.history = rows.map((r) => r.command).reverse();
    this.position = this.history.length;
  }

  add(command: string): void {
    // Don't add duplicates of the last command
    if (this.history.length > 0 && this.history[this.history.length - 1] === command) {
      this.position = this.history.length;
      return;
    }

    this.history.push(command);
    this.position = this.history.length;

    // Persist to SQLite if available
    if (this.db) {
      this.db.run(`INSERT INTO history (command, timestamp) VALUES (?, ?)`, [command, Date.now()]);
    }
  }

  previous(): string | null {
    if (this.history.length === 0) return null;

    if (this.position > 0) {
      this.position--;
    }

    return this.history[this.position] || null;
  }

  next(): string | null {
    if (this.position < this.history.length - 1) {
      this.position++;
      return this.history[this.position];
    }

    this.position = this.history.length;
    return null;
  }

  getLast(): string | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getByIndex(index: number): string | null {
    // 1-indexed for user convenience
    const idx = index - 1;
    if (idx >= 0 && idx < this.history.length) {
      return this.history[idx];
    }
    return null;
  }

  findByPrefix(prefix: string): string | null {
    // Search from most recent
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].startsWith(prefix)) {
        return this.history[i];
      }
    }
    return null;
  }

  /**
   * Search history for commands matching a pattern (for Ctrl-R)
   */
  search(pattern: string): string[] {
    const lowerPattern = pattern.toLowerCase();
    const results: string[] = [];
    const seen = new Set<string>();

    // Search from most recent
    for (let i = this.history.length - 1; i >= 0; i--) {
      const cmd = this.history[i];
      if (!seen.has(cmd) && cmd.toLowerCase().includes(lowerPattern)) {
        results.push(cmd);
        seen.add(cmd);
      }
    }

    return results;
  }

  /**
   * Full-text search in SQLite for deep history
   */
  searchDeep(pattern: string, limit = 50): string[] {
    if (!this.db) {
      return this.search(pattern);
    }

    const rows = this.db
      .query<{ command: string }, [string, number]>(
        `SELECT DISTINCT command FROM history
         WHERE command LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(`%${pattern}%`, limit);

    return rows.map((r) => r.command);
  }

  reset(): void {
    this.position = this.history.length;
  }

  getAll(): string[] {
    return [...this.history];
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
