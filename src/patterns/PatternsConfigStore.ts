import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse, stringify } from "yaml";

/**
 * PatternsConfigStore - Manages patterns.yaml for message classifiers
 *
 * Pattern groups are user-defined collections of regex patterns.
 * Messages matching a pattern are classified by the group name.
 */

export interface PatternsConfig {
  groups: Record<string, string[]>;
  continuation?: string;
}

const DEFAULT_PATTERNS: PatternsConfig = {
  groups: {},
};

export class PatternsConfigStore {
  private config: PatternsConfig;
  private configPath: string;
  private panesConfigPath: string;
  private baseDir: string;

  constructor() {
    this.baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
    this.configPath = join(this.baseDir, "patterns.yaml");
    this.panesConfigPath = join(this.baseDir, "panes.yaml");
    this.config = this.load();
  }

  private load(): PatternsConfig {
    // Try loading patterns.yaml first
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, "utf-8");
        const parsed = parse(content) as Record<string, unknown>;

        // Check if it's the new format (has 'groups' key) or old format
        if (parsed.groups) {
          return this.mergeWithDefaults(parsed as Partial<PatternsConfig>);
        } else {
          // Old format: group names at top level with array of {pattern: string} objects
          return this.migrateOldPatternsYaml(parsed);
        }
      } catch (err) {
        console.error("Error loading patterns.yaml, checking panes.yaml:", err);
      }
    }

    // Fall back to migrating from panes.yaml
    return this.migrateFromPanesYaml();
  }

  private migrateOldPatternsYaml(parsed: Record<string, unknown>): PatternsConfig {
    const groups: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (key === "continuation") continue;
      if (key === "channelContent") continue; // Skip - was for sender extraction

      if (Array.isArray(value)) {
        groups[key] = value.map((item: unknown) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item && "pattern" in item) {
            return (item as { pattern: string }).pattern;
          }
          return "";
        }).filter(Boolean);
      }
    }

    const continuation = typeof parsed.continuation === "string" ? parsed.continuation : undefined;

    const migrated: PatternsConfig = { groups, continuation };

    // Save in new format
    this.config = migrated;
    this.save();
    console.log("Migrated patterns.yaml to new format");

    return migrated;
  }

  private migrateFromPanesYaml(): PatternsConfig {
    if (!existsSync(this.panesConfigPath)) {
      return DEFAULT_PATTERNS;
    }

    try {
      const content = readFileSync(this.panesConfigPath, "utf-8");
      const parsed = parse(content) as {
        classifiers?: {
          tell?: { pattern: string }[];
          say?: { pattern: string }[];
          channel?: { pattern: string }[];
          channelContent?: { pattern: string }[];
          continuation?: string;
        };
      };

      if (parsed.classifiers) {
        const groups: Record<string, string[]> = {};

        // Migrate old pattern arrays to groups
        if (parsed.classifiers.tell?.length) {
          groups.tell = parsed.classifiers.tell.map((p) => p.pattern);
        }
        if (parsed.classifiers.say?.length) {
          groups.say = parsed.classifiers.say.map((p) => p.pattern);
        }
        if (parsed.classifiers.channel?.length) {
          groups.channel = parsed.classifiers.channel.map((p) => p.pattern);
        }
        // Note: channelContent was for sender extraction, skip it in migration

        if (Object.keys(groups).length > 0 || parsed.classifiers.continuation) {
          const migrated: PatternsConfig = {
            groups,
            continuation: parsed.classifiers.continuation,
          };

          // Save migrated patterns to patterns.yaml
          this.config = migrated;
          this.save();
          console.log("Migrated classifiers from panes.yaml to patterns.yaml");
          return migrated;
        }
      }
    } catch (err) {
      console.error("Error migrating from panes.yaml:", err);
    }

    return DEFAULT_PATTERNS;
  }

  private mergeWithDefaults(parsed: Partial<PatternsConfig>): PatternsConfig {
    return {
      groups: parsed.groups || {},
      continuation: parsed.continuation,
    };
  }

  private save(): void {
    const content = stringify(this.config);
    writeFileSync(this.configPath, content);
  }

  /**
   * Get all pattern groups
   */
  getGroups(): Record<string, string[]> {
    return { ...this.config.groups };
  }

  /**
   * Get patterns for a specific group
   */
  getGroup(name: string): string[] | undefined {
    return this.config.groups[name];
  }

  /**
   * Get list of all group names
   */
  getGroupNames(): string[] {
    return Object.keys(this.config.groups);
  }

  /**
   * Get the full patterns config
   * Reloads from disk to pick up changes from GUI
   */
  getConfig(): PatternsConfig {
    this.config = this.load();
    return {
      groups: { ...this.config.groups },
      continuation: this.config.continuation,
    };
  }

  /**
   * Replace entire patterns config
   */
  setConfig(config: PatternsConfig): void {
    this.config = {
      groups: { ...config.groups },
      continuation: config.continuation,
    };
    this.save();
  }

  /**
   * Validate a regex pattern string
   * @returns null if valid, error message if invalid
   */
  static validateRegex(pattern: string): string | null {
    try {
      new RegExp(pattern);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid regex";
    }
  }

  /**
   * Validate all patterns in the config
   * @returns array of errors, empty if all valid
   */
  validateConfig(): string[] {
    const errors: string[] = [];

    for (const [groupName, patterns] of Object.entries(this.config.groups)) {
      for (let i = 0; i < patterns.length; i++) {
        const err = PatternsConfigStore.validateRegex(patterns[i]);
        if (err) errors.push(`${groupName} pattern ${i + 1}: ${err}`);
      }
    }

    if (this.config.continuation) {
      const err = PatternsConfigStore.validateRegex(this.config.continuation);
      if (err) errors.push(`Continuation pattern: ${err}`);
    }

    return errors;
  }

  // Group CRUD operations
  addGroup(name: string): boolean {
    if (this.config.groups[name]) return false;
    this.config.groups[name] = [];
    this.save();
    return true;
  }

  renameGroup(oldName: string, newName: string): boolean {
    if (!this.config.groups[oldName] || this.config.groups[newName]) return false;
    this.config.groups[newName] = this.config.groups[oldName];
    delete this.config.groups[oldName];
    this.save();
    return true;
  }

  removeGroup(name: string): boolean {
    if (!this.config.groups[name]) return false;
    delete this.config.groups[name];
    this.save();
    return true;
  }

  // Pattern CRUD operations within a group
  addPattern(groupName: string, pattern: string): boolean {
    if (!this.config.groups[groupName]) return false;
    this.config.groups[groupName].push(pattern);
    this.save();
    return true;
  }

  updatePattern(groupName: string, index: number, pattern: string): boolean {
    const group = this.config.groups[groupName];
    if (!group || index < 0 || index >= group.length) return false;
    group[index] = pattern;
    this.save();
    return true;
  }

  removePattern(groupName: string, index: number): boolean {
    const group = this.config.groups[groupName];
    if (!group || index < 0 || index >= group.length) return false;
    group.splice(index, 1);
    this.save();
    return true;
  }

  // Continuation pattern
  setContinuationPattern(pattern: string | undefined): void {
    this.config.continuation = pattern;
    this.save();
  }

  getContinuationPattern(): string | undefined {
    return this.config.continuation;
  }

  /**
   * Reload config from disk
   */
  reload(): void {
    this.config = this.load();
  }
}
