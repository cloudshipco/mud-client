import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse, stringify } from "yaml";
import type { PanesConfig, PaneConfig } from "./types";

const DEFAULT_PANES: PaneConfig[] = [];

export class PaneConfigStore {
  private config: PanesConfig;
  private configPath: string;

  constructor() {
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "panes.yaml");
    this.config = this.load();
  }

  private load(): PanesConfig {
    if (!existsSync(this.configPath)) {
      return this.getDefaults();
    }

    try {
      const content = readFileSync(this.configPath, "utf-8");
      const parsed = parse(content) as Partial<PanesConfig> & {
        // Handle old format with types instead of patterns
        panes?: Array<
          Partial<PaneConfig> & {
            filter?: {
              types?: string[];
              patterns?: string[];
              channels?: string[];
              excludeChannels?: string[];
              pattern?: string;
            };
          }
        >;
      };
      return this.mergeWithDefaults(parsed);
    } catch (err) {
      console.error("Error loading panes.yaml, using defaults:", err);
      return this.getDefaults();
    }
  }

  private getDefaults(): PanesConfig {
    return {
      panes: DEFAULT_PANES,
    };
  }

  private mergeWithDefaults(
    parsed: Partial<PanesConfig> & {
      panes?: Array<
        Partial<PaneConfig> & {
          filter?: {
            types?: string[];
            patterns?: string[];
            channels?: string[];
            excludeChannels?: string[];
            pattern?: string;
          };
        }
      >;
    }
  ): PanesConfig {
    const panes: PaneConfig[] = (parsed.panes || []).map((p) => {
      // Migrate 'types' to 'patterns' if present
      // Cast to handle both old and new filter formats
      const oldFilter = (p.filter || {}) as {
        types?: string[];
        patterns?: string[];
        channels?: string[];
        excludeChannels?: string[];
        pattern?: string;
      };
      const patterns = oldFilter.patterns || oldFilter.types || [];
      // Migrate 'channels' to patterns (they were channel names, now group names)
      if (oldFilter.channels?.length && !patterns.length) {
        patterns.push(...oldFilter.channels);
      }

      return {
        id: p.id || "unnamed",
        enabled: p.enabled,
        position: p.position || "top",
        height: p.height || 5,
        filter: {
          patterns: patterns.length > 0 ? patterns : undefined,
          excludePatterns: oldFilter.excludeChannels, // Migrate excludeChannels
          pattern: oldFilter.pattern,
        },
        maxMessages: p.maxMessages,
        passthrough: p.passthrough,
      };
    });

    return { panes };
  }

  /**
   * Get pane configs - reloads from disk to pick up GUI changes
   */
  getPanes(): PaneConfig[] {
    this.config = this.load();
    return this.config.panes;
  }

  getTotalPaneHeight(): number {
    return this.config.panes
      .filter((p) => p.position === "top" && p.enabled !== false)
      .reduce((sum, p) => sum + p.height, 0);
  }

  writeDefaultConfig(): void {
    const content = stringify(this.getDefaults());
    writeFileSync(this.configPath, content);
  }

  setPaneEnabled(id: string, enabled: boolean): boolean {
    const pane = this.config.panes.find((p) => p.id === id);
    if (!pane) return false;

    pane.enabled = enabled;
    this.save();
    return true;
  }

  setPaneHeight(id: string, height: number): boolean {
    const pane = this.config.panes.find((p) => p.id === id);
    if (!pane) return false;

    pane.height = height;
    this.save();
    return true;
  }

  setPanePassthrough(id: string, passthrough: boolean): boolean {
    const pane = this.config.panes.find((p) => p.id === id);
    if (!pane) return false;

    pane.passthrough = passthrough;
    this.save();
    return true;
  }

  setPaneMaxMessages(id: string, maxMessages: number): boolean {
    const pane = this.config.panes.find((p) => p.id === id);
    if (!pane) return false;

    pane.maxMessages = maxMessages;
    this.save();
    return true;
  }

  setPanePatterns(id: string, patterns: string[]): boolean {
    const pane = this.config.panes.find((p) => p.id === id);
    if (!pane) return false;

    pane.filter.patterns = patterns.length > 0 ? patterns : undefined;
    this.save();
    return true;
  }

  private save(): void {
    const content = stringify(this.config);
    writeFileSync(this.configPath, content);
  }
}
