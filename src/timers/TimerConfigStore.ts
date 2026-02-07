import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse, stringify } from "yaml";

/** Timer action types */
export type TimerActionType = "send" | "notify" | "disable_trigger" | "enable_trigger" | "disable_timer" | "enable_timer" | "wait";

/** Timer action with type and value */
export interface TimerAction {
  type: TimerActionType;
  value: string | number;
}

export interface TimerDefinition {
  name: string;
  enabled: boolean;
  interval: number;      // seconds
  actions?: TimerAction[];  // actions to execute each tick
  commands?: string[];    // @deprecated - legacy support
}

export interface TimersConfig {
  timers: TimerDefinition[];
}

const DEFAULT_CONFIG: TimersConfig = {
  timers: [],
};

export class TimerConfigStore {
  private config: TimersConfig;
  private configPath: string;

  constructor() {
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "timers.yaml");
    this.config = this.load();
  }

  private load(): TimersConfig {
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, "utf-8");
        const parsed = parse(content) as Partial<TimersConfig>;
        const timers = Array.isArray(parsed?.timers) ? parsed.timers : [];

        // Normalize timers to ensure all fields exist
        return {
          timers: timers.map(t => ({
            name: t.name || "",
            enabled: t.enabled !== false,
            interval: typeof t.interval === "number" ? t.interval : 60,
            actions: Array.isArray(t.actions) ? t.actions : undefined,
            commands: Array.isArray(t.commands) ? t.commands : [],
          })),
        };
      } catch (err) {
        console.error("Error loading timers.yaml:", err);
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    const content = stringify(this.config);
    writeFileSync(this.configPath, content);
  }

  getTimers(): TimerDefinition[] {
    return [...this.config.timers];
  }

  /**
   * Get the full timers config, reloading from disk to pick up GUI changes
   */
  getConfig(): TimersConfig {
    this.config = this.load();
    return {
      timers: [...this.config.timers],
    };
  }

  getTimer(name: string): TimerDefinition | undefined {
    return this.config.timers.find((t) => t.name === name);
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const timer = this.config.timers.find((t) => t.name === name);
    if (!timer) return false;
    timer.enabled = enabled;
    this.save();
    return true;
  }

  reload(): TimersConfig {
    this.config = this.load();
    return {
      timers: [...this.config.timers],
    };
  }
}
