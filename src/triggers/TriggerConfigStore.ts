import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parse, stringify } from "yaml";

/** Condition operator for comparing captured values */
export type ConditionOperator =
  | "eq"
  | "neq"
  | "lt"
  | "gt"
  | "lte"
  | "gte"
  | "in"
  | "not_in"
  | "contains"
  | "matches";

export interface TriggerCondition {
  /** Named capture group to extract the value from */
  capture: string;
  operator: ConditionOperator;
  /** Comparison value — scalar or array for in/not_in */
  value: string | number | (string | number)[];
}

export type TriggerActionType = "send" | "disable_trigger" | "enable_trigger" | "notify" | "set_variable";

/** Base action with type and value */
export interface BaseTriggerAction {
  type: Exclude<TriggerActionType, "set_variable">;
  value: string;
}

/** Action to set a variable from a capture group */
export interface SetVariableAction {
  type: "set_variable";
  name: string;           // Variable name to set
  capture: string;        // Named capture group from pattern match
  valueType?: "string" | "number";  // Optional type (default: string)
}

export type TriggerAction = BaseTriggerAction | SetVariableAction;

/** Resolved set_variable action with the captured value ready to apply */
export interface ResolvedSetVariableAction {
  type: "set_variable";
  name: string;
  value: string | number;
  valueType: "string" | "number";
}

export interface TriggerDefinition {
  name: string;
  /** Pattern group names to match against (OR logic - any pattern in any group fires) */
  patternGroups: string[];
  /** @deprecated Inline patterns - for migration only */
  patterns?: string[];
  /** Optional conditions (AND logic — all must pass) */
  conditions?: TriggerCondition[];
  /** Actions to execute when trigger fires */
  actions: TriggerAction[];
  /** @deprecated Use actions array instead */
  action?: string;
  enabled: boolean;
}

export interface TriggersConfig {
  triggers: TriggerDefinition[];
}

const DEFAULT_CONFIG: TriggersConfig = {
  triggers: [],
};

export class TriggerConfigStore {
  private config: TriggersConfig;
  private configPath: string;

  constructor() {
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "triggers.yaml");
    this.config = this.load();
  }

  private load(): TriggersConfig {
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, "utf-8");
        const parsed = parse(content) as Partial<TriggersConfig>;
        const triggers = Array.isArray(parsed?.triggers) ? parsed.triggers : [];

        // Normalize triggers to ensure patternGroups exists
        return {
          triggers: triggers.map(t => ({
            ...t,
            patternGroups: t.patternGroups || [],
          })),
        };
      } catch (err) {
        console.error("Error loading triggers.yaml:", err);
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    const content = stringify(this.config);
    writeFileSync(this.configPath, content);
  }

  getTriggers(): TriggerDefinition[] {
    return [...this.config.triggers];
  }

  /**
   * Get the full triggers config, reloading from disk to pick up GUI changes
   */
  getConfig(): TriggersConfig {
    this.config = this.load();
    return {
      triggers: [...this.config.triggers],
    };
  }

  getTrigger(name: string): TriggerDefinition | undefined {
    return this.config.triggers.find((t) => t.name === name);
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const trigger = this.config.triggers.find((t) => t.name === name);
    if (!trigger) return false;
    trigger.enabled = enabled;
    this.save();
    return true;
  }

  reload(): TriggersConfig {
    this.config = this.load();
    return {
      triggers: [...this.config.triggers],
    };
  }
}
