/**
 * MessageClassifier - Identifies communication messages from MUD output
 *
 * Classifies lines by matching against named pattern groups.
 * Patterns are configurable via patterns.yaml.
 * Supports continuation lines (e.g., indented lines that belong to previous message).
 */

import type { PatternsConfig } from "../patterns/PatternsConfigStore";

export interface ClassifiedMessage {
  type: string; // Group name or "other"
  raw: string;
  isContinuation?: boolean;
}

interface CompiledGroup {
  name: string;
  patterns: RegExp[];
}

export class MessageClassifier {
  private groups: CompiledGroup[] = [];
  private continuationPattern: RegExp | null = null;
  private configHash: string = "";

  // Track last classification for continuation support
  private lastClassification: ClassifiedMessage | null = null;

  constructor(config?: PatternsConfig) {
    if (config) {
      this.loadFromConfig(config);
    }
  }

  /**
   * Compute a hash of the config for change detection
   */
  private computeConfigHash(config: PatternsConfig): string {
    return JSON.stringify({
      groups: config.groups,
      continuation: config.continuation,
    });
  }

  /**
   * Update config if it has changed
   * Returns true if config was reloaded
   */
  updateIfChanged(config: PatternsConfig): boolean {
    const newHash = this.computeConfigHash(config);
    if (newHash !== this.configHash) {
      this.loadFromConfig(config);
      return true;
    }
    return false;
  }

  loadFromConfig(config: PatternsConfig): void {
    this.groups = [];
    this.configHash = this.computeConfigHash(config);

    for (const [name, patterns] of Object.entries(config.groups)) {
      const compiled: RegExp[] = [];
      for (const pattern of patterns) {
        try {
          compiled.push(new RegExp(pattern));
        } catch (err) {
          console.error(`Invalid regex in group "${name}": ${pattern}`, err);
        }
      }
      if (compiled.length > 0) {
        this.groups.push({ name, patterns: compiled });
      }
    }

    if (config.continuation) {
      try {
        this.continuationPattern = new RegExp(config.continuation);
      } catch (err) {
        console.error(`Invalid continuation pattern: ${config.continuation}`, err);
        this.continuationPattern = null;
      }
    } else {
      this.continuationPattern = null;
    }
  }

  classify(line: string): ClassifiedMessage {
    // Check for continuation first (if we have a previous non-other classification)
    if (
      this.continuationPattern &&
      this.lastClassification &&
      this.lastClassification.type !== "other" &&
      this.continuationPattern.test(line)
    ) {
      const result: ClassifiedMessage = {
        type: this.lastClassification.type,
        raw: line,
        isContinuation: true,
      };
      // Don't update lastClassification - keep tracking the original message
      return result;
    }

    // Check each group's patterns
    for (const group of this.groups) {
      for (const pattern of group.patterns) {
        if (pattern.test(line)) {
          const result: ClassifiedMessage = {
            type: group.name,
            raw: line,
          };
          this.lastClassification = result;
          return result;
        }
      }
    }

    // Default to "other" - reset continuation tracking
    this.lastClassification = null;
    return {
      type: "other",
      raw: line,
    };
  }

  // Reset continuation tracking (call between separate message batches if needed)
  resetContinuation(): void {
    this.lastClassification = null;
  }

  classifyLines(text: string): ClassifiedMessage[] {
    const lines = text.split("\n");
    return lines.map((line) => this.classify(line));
  }

  /**
   * Get list of all configured group names
   */
  getGroupNames(): string[] {
    return this.groups.map((g) => g.name);
  }
}
