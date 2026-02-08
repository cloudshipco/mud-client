/**
 * ConfigStore for gauge/status line configuration.
 * Loads and saves gauge settings from gauges.yaml
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse, stringify } from "yaml";
import type { GaugeConfig, GaugesConfig, StatusLineConfig } from "./types";

const DEFAULT_GAUGE_COLORS = {
  high: "\x1b[32m",   // Green
  mid: "\x1b[33m",    // Yellow
  low: "\x1b[31m",    // Red
};

const DEFAULT_CONFIG: GaugesConfig = {
  gauges: [],
  statusLine: {
    enabled: true,
    position: "above-input",
  },
};

export class GaugeConfigStore {
  private config: GaugesConfig;
  private configPath: string;

  constructor() {
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "gauges.yaml");
    this.config = this.load();
  }

  private load(): GaugesConfig {
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, "utf-8");
        const parsed = parse(content) as Partial<GaugesConfig>;

        // Normalize gauges
        const gauges: GaugeConfig[] = Array.isArray(parsed?.gauges)
          ? parsed.gauges.map(g => ({
              variable: g.variable || "",
              maxVariable: g.maxVariable,
              max: g.max,
              label: g.label || g.variable || "",
              width: g.width ?? 10,
              color: g.color,
              colors: g.colors ? {
                high: g.colors.high || DEFAULT_GAUGE_COLORS.high,
                mid: g.colors.mid || DEFAULT_GAUGE_COLORS.mid,
                low: g.colors.low || DEFAULT_GAUGE_COLORS.low,
              } : undefined,
            }))
          : [];

        // Normalize statusLine config
        const statusLine: StatusLineConfig = {
          enabled: parsed?.statusLine?.enabled !== false,
          position: "above-input",
        };

        return { gauges, statusLine };
      } catch (err) {
        console.error("Error loading gauges.yaml:", err);
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    const content = stringify(this.config);
    writeFileSync(this.configPath, content);
  }

  /**
   * Get the full config, reloading from disk to pick up GUI changes
   */
  getConfig(): GaugesConfig {
    this.config = this.load();
    return { ...this.config };
  }

  /**
   * Get gauge configurations (reloads from disk to pick up GUI changes)
   */
  getGauges(): GaugeConfig[] {
    this.config = this.load();
    return [...this.config.gauges];
  }

  /**
   * Get status line configuration (reloads from disk to pick up GUI changes)
   */
  getStatusLineConfig(): StatusLineConfig {
    this.config = this.load();
    return { ...this.config.statusLine };
  }

  /**
   * Check if status line is enabled (reloads from disk to pick up GUI changes)
   */
  isStatusLineEnabled(): boolean {
    this.config = this.load();
    return this.config.statusLine.enabled;
  }

  /**
   * Set entire config
   */
  setConfig(config: GaugesConfig): void {
    this.config = config;
    this.save();
  }

  /**
   * Reload config from disk
   */
  reload(): GaugesConfig {
    this.config = this.load();
    return { ...this.config };
  }

  /**
   * Enable or disable the status line
   */
  setStatusLineEnabled(enabled: boolean): void {
    this.config.statusLine.enabled = enabled;
    this.save();
  }

  /**
   * Get gauges filtered by profile.
   * If gaugeVars is undefined, returns all gauges.
   * If gaugeVars is an array, returns only gauges whose variables are in the array.
   */
  getGaugesFiltered(gaugeVars: string[] | undefined): GaugeConfig[] {
    this.config = this.load();
    if (gaugeVars === undefined) {
      return [...this.config.gauges];
    }
    const varSet = new Set(gaugeVars);
    return this.config.gauges.filter(g => varSet.has(g.variable));
  }

  /**
   * Get config filtered by profile.
   * If gaugeVars is undefined, returns all gauges.
   * If gaugeVars is an array, returns only gauges whose variables are in the array.
   */
  getConfigFiltered(gaugeVars: string[] | undefined): GaugesConfig {
    return {
      gauges: this.getGaugesFiltered(gaugeVars),
      statusLine: { ...this.config.statusLine },
    };
  }
}
