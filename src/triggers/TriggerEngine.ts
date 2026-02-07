import { TriggerConfigStore } from "./TriggerConfigStore";
import type {
  TriggerDefinition,
  TriggerCondition,
  TriggerAction,
  ConditionOperator,
  TriggersConfig,
  SetVariableAction,
  ResolvedSetVariableAction,
  WaitAction,
} from "./TriggerConfigStore";

/** Resolved action - either a standard action or a resolved set_variable with captured value */
export type ResolvedTriggerAction =
  | Exclude<TriggerAction, SetVariableAction | WaitAction>
  | ResolvedSetVariableAction
  | WaitAction;

/** Pattern groups mapping: group name -> array of regex patterns */
export type PatternGroups = Record<string, string[]>;

interface CompiledTrigger {
  definition: TriggerDefinition;
  compiledPatterns: RegExp[];
}

export class TriggerEngine {
  private store: TriggerConfigStore;
  private compiled: CompiledTrigger[] = [];
  /** Runtime enable/disable overrides (cleared on reload) */
  private runtimeEnabled: Map<string, boolean> = new Map();
  private configHash: string = "";
  private patternGroups: PatternGroups = {};

  constructor(store: TriggerConfigStore, patternGroups: PatternGroups = {}) {
    this.store = store;
    this.patternGroups = patternGroups;
    const config = store.getConfig();
    this.configHash = this.computeConfigHash(config, patternGroups);
    this.compileFromConfig(config);
  }

  private computeConfigHash(config: TriggersConfig, patternGroups: PatternGroups): string {
    return JSON.stringify({ config, patternGroups });
  }

  /**
   * Update pattern groups (from patterns.yaml).
   * Call this when patterns config changes.
   */
  updatePatternGroups(patternGroups: PatternGroups): void {
    this.patternGroups = patternGroups;
    const config = this.store.getConfig();
    this.configHash = this.computeConfigHash(config, patternGroups);
    this.compileFromConfig(config);
  }

  /**
   * Check if config changed and recompile if needed.
   * Call this before evaluating triggers to pick up GUI changes.
   */
  updateIfChanged(config: TriggersConfig, patternGroups?: PatternGroups): boolean {
    if (patternGroups) {
      this.patternGroups = patternGroups;
    }
    const newHash = this.computeConfigHash(config, this.patternGroups);
    if (newHash !== this.configHash) {
      this.configHash = newHash;
      this.runtimeEnabled.clear();
      this.compileFromConfig(config);
      return true;
    }
    return false;
  }

  /**
   * Resolve patternGroups to actual regex pattern strings.
   * Falls back to legacy patterns field if patternGroups is empty.
   */
  private resolvePatterns(trigger: TriggerDefinition): string[] {
    // Use patternGroups if available
    if (trigger.patternGroups && trigger.patternGroups.length > 0) {
      const resolved: string[] = [];
      for (const groupName of trigger.patternGroups) {
        const patterns = this.patternGroups[groupName];
        if (patterns) {
          resolved.push(...patterns);
        }
      }
      return resolved;
    }

    // Fallback to legacy patterns field (for backwards compatibility)
    if (trigger.patterns && trigger.patterns.length > 0) {
      return trigger.patterns;
    }

    return [];
  }

  /** Recompile triggers from config */
  private compileFromConfig(config: TriggersConfig): void {
    this.compiled = [];

    for (const trigger of config.triggers) {
      const compiledPatterns: RegExp[] = [];
      const patternStrings = this.resolvePatterns(trigger);

      for (const pattern of patternStrings) {
        try {
          compiledPatterns.push(new RegExp(pattern));
        } catch {
          // Skip invalid patterns (validation catches these separately)
        }
      }
      this.compiled.push({ definition: trigger, compiledPatterns });
    }
  }

  /**
   * Evaluate a stripped line against all enabled triggers.
   * Returns an array of resolved actions to execute (with captures resolved).
   */
  evaluate(strippedLine: string): ResolvedTriggerAction[] {
    const actions: ResolvedTriggerAction[] = [];

    for (const trigger of this.compiled) {
      if (!this.isEnabled(trigger.definition)) continue;

      for (const regex of trigger.compiledPatterns) {
        const match = regex.exec(strippedLine);
        if (!match) continue;

        // Check conditions if any
        if (trigger.definition.conditions?.length) {
          if (!this.evaluateConditions(trigger.definition.conditions, match)) {
            continue;
          }
        }

        // Get actions (handle legacy single action field) and resolve captures
        const triggerActions = this.getActions(trigger.definition);
        const resolvedActions = this.resolveActions(triggerActions, match);
        actions.push(...resolvedActions);
        break; // One match per trigger is enough (OR logic across patterns)
      }
    }

    return actions;
  }

  /**
   * Resolve actions, converting set_variable actions to include captured values
   */
  private resolveActions(
    actions: TriggerAction[],
    match: RegExpExecArray,
  ): ResolvedTriggerAction[] {
    const resolved: ResolvedTriggerAction[] = [];

    for (const action of actions) {
      if (action.type === "set_variable") {
        const captured = match.groups?.[action.capture];
        if (captured !== undefined) {
          // Auto-infer type: if it parses as a number (and isn't empty), use number
          const parsed = parseFloat(captured);
          const isNumber = captured.trim() !== "" && !isNaN(parsed);
          const value = isNumber ? parsed : captured;
          const valueType = isNumber ? "number" : "string";
          resolved.push({
            type: "set_variable",
            name: action.name,
            value,
            valueType,
          });
        }
      } else {
        resolved.push(action);
      }
    }

    return resolved;
  }

  /** Get actions from trigger, handling legacy action field */
  private getActions(trigger: TriggerDefinition): TriggerAction[] {
    if (trigger.actions && trigger.actions.length > 0) {
      return trigger.actions;
    }
    // Legacy: single action string
    if (trigger.action) {
      return [{ type: "send", value: trigger.action }];
    }
    return [];
  }

  private isEnabled(trigger: TriggerDefinition): boolean {
    const runtimeOverride = this.runtimeEnabled.get(trigger.name);
    if (runtimeOverride !== undefined) return runtimeOverride;
    return trigger.enabled;
  }

  private evaluateConditions(
    conditions: TriggerCondition[],
    match: RegExpExecArray,
  ): boolean {
    for (const condition of conditions) {
      // Skip empty/invalid conditions
      if (!condition.capture || condition.capture.trim() === '') continue;

      const captured = match.groups?.[condition.capture];
      if (captured === undefined) return false;

      if (!this.evaluateCondition(captured, condition.operator, condition.value)) {
        return false;
      }
    }
    return true; // AND logic — all must pass
  }

  private evaluateCondition(
    captured: string,
    operator: ConditionOperator,
    value: string | number | (string | number)[],
  ): boolean {
    switch (operator) {
      case "eq":
        return captured === String(value);
      case "neq":
        return captured !== String(value);
      case "lt":
        return this.toNumber(captured) < this.toNumber(value);
      case "gt":
        return this.toNumber(captured) > this.toNumber(value);
      case "lte":
        return this.toNumber(captured) <= this.toNumber(value);
      case "gte":
        return this.toNumber(captured) >= this.toNumber(value);
      case "in":
        return Array.isArray(value) && value.map(String).includes(captured);
      case "not_in":
        return Array.isArray(value) && !value.map(String).includes(captured);
      case "contains":
        return captured.includes(String(value));
      case "matches": {
        try {
          return new RegExp(String(value)).test(captured);
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  }

  private toNumber(val: string | number | (string | number)[]): number {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val) || 0;
    return 0;
  }

  // Runtime enable/disable (does not persist — use store.setEnabled for persistence)
  setEnabled(name: string, enabled: boolean): boolean {
    const trigger = this.compiled.find((t) => t.definition.name === name);
    if (!trigger) return false;
    this.runtimeEnabled.set(name, enabled);
    return true;
  }

  /** Reload triggers from disk */
  reload(): void {
    const config = this.store.reload();
    this.configHash = this.computeConfigHash(config, this.patternGroups);
    this.runtimeEnabled.clear();
    this.compileFromConfig(config);
  }

  /** List all triggers with their effective enabled state */
  listTriggers(): { name: string; enabled: boolean; patternCount: number }[] {
    return this.compiled.map((t) => ({
      name: t.definition.name,
      enabled: this.isEnabled(t.definition),
      patternCount: t.compiledPatterns.length,
    }));
  }
}
