import { existsSync, mkdirSync, readFileSync, writeFileSync, watch, FSWatcher } from "fs";
import { join } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";

export type StatusPosition = "prompt" | "right" | "hidden";
export type TimestampMode = "hidden" | "time" | "datetime";
export type InputMode = "select" | "clear";

export interface AppSettings {
  statusPosition: StatusPosition;
  echoCommands: boolean;
  timestamps: TimestampMode;
  autoReconnect: boolean;
  movementKeys: boolean;
  inputMode: InputMode;
  wordWrap: boolean;
  commandSeparator: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  statusPosition: "right",
  echoCommands: true,
  timestamps: "hidden",
  autoReconnect: false,
  movementKeys: true,
  inputMode: "select",
  wordWrap: false,
  commandSeparator: ";;",
};

const VALID_VALUES: Record<keyof AppSettings, readonly string[]> = {
  statusPosition: ["prompt", "right", "hidden"] as const,
  echoCommands: ["true", "false"] as const,
  timestamps: ["hidden", "time", "datetime"] as const,
  autoReconnect: ["true", "false"] as const,
  movementKeys: ["true", "false"] as const,
  inputMode: ["select", "clear"] as const,
  wordWrap: ["true", "false"] as const,
  commandSeparator: [] as const, // Empty array = any string value allowed
};

const DESCRIPTIONS: Record<keyof AppSettings, string> = {
  statusPosition: "Where to show username@host (prompt=inline, right=right-aligned, hidden=off)",
  echoCommands: "Show sent commands in the output area",
  timestamps: "Add timestamps to messages (hidden, time, or datetime)",
  autoReconnect: "Automatically reconnect after disconnection",
  movementKeys: "Enable Shift+HJKL roguelike movement shortcuts",
  inputMode: "After sending: select (highlight text) or clear (empty input)",
  wordWrap: "Wrap long lines from the MUD to fit terminal width",
  commandSeparator: "Separator for chaining commands (e.g., 'e;;e;;n'). Use 'none' to disable",
};

export class SettingsManager extends EventEmitter {
  private settings: AppSettings;
  private configPath: string;
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isSaving = false;

  constructor() {
    super();
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "settings.json");
    this.settings = this.load();
    this.startWatching();
  }

  private startWatching(): void {
    try {
      this.watcher = watch(this.configPath, (eventType) => {
        if (eventType === "change" && !this.isSaving) {
          // Debounce to avoid multiple reloads for a single save
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }
          this.debounceTimer = setTimeout(() => {
            this.reload();
          }, 100);
        }
      });
    } catch {
      // File might not exist yet, that's ok
    }
  }

  private load(): AppSettings {
    if (!existsSync(this.configPath)) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const content = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(content);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  reload(): void {
    const oldSettings = { ...this.settings };
    this.settings = this.load();

    // Find which settings changed
    const changedKeys: (keyof AppSettings)[] = [];
    for (const key of Object.keys(this.settings) as (keyof AppSettings)[]) {
      if (oldSettings[key] !== this.settings[key]) {
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      this.emit("changed", changedKeys, this.settings);
    }
  }

  private save(): void {
    this.isSaving = true;
    writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2));
    // Reset flag after a short delay to ignore the file change event we just caused
    setTimeout(() => {
      this.isSaving = false;
    }, 150);
  }

  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  set<K extends keyof AppSettings>(key: K, value: string): boolean {
    const validValues = VALID_VALUES[key];
    // Empty validValues array means any string is allowed
    if (validValues.length > 0 && !validValues.includes(value)) {
      return false;
    }
    // Convert string to appropriate type
    const currentValue = this.settings[key];
    if (typeof currentValue === "boolean") {
      (this.settings[key] as boolean) = value === "true";
    } else {
      (this.settings[key] as string) = value;
    }
    this.save();
    return true;
  }

  getAll(): AppSettings {
    return { ...this.settings };
  }

  getValidValues<K extends keyof AppSettings>(key: K): readonly string[] {
    const values = VALID_VALUES[key];
    // Return helpful text for freeform string fields
    return values.length > 0 ? values : ["(any string)"];
  }

  isValidKey(key: string): key is keyof AppSettings {
    return key in DEFAULT_SETTINGS;
  }

  getKeys(): string[] {
    return Object.keys(DEFAULT_SETTINGS);
  }

  getDescription<K extends keyof AppSettings>(key: K): string {
    return DESCRIPTIONS[key];
  }
}
