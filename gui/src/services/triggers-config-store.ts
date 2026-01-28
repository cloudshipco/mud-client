/**
 * Triggers config store service for mud-client trigger settings
 * Reads/writes ~/.config/mud-client/triggers.yaml
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export type ConditionOperator =
  | 'eq' | 'neq' | 'lt' | 'gt' | 'lte' | 'gte'
  | 'in' | 'not_in' | 'contains' | 'matches';

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'lt', label: '<' },
  { value: 'gt', label: '>' },
  { value: 'lte', label: '<=' },
  { value: 'gte', label: '>=' },
  { value: 'in', label: 'in' },
  { value: 'not_in', label: 'not in' },
  { value: 'contains', label: 'contains' },
  { value: 'matches', label: 'matches' },
];

export type TriggerActionType = 'send' | 'disable_trigger' | 'enable_trigger' | 'notify';

export const ACTION_TYPES: { value: TriggerActionType; label: string }[] = [
  { value: 'send', label: 'Send command' },
  { value: 'disable_trigger', label: 'Disable trigger' },
  { value: 'enable_trigger', label: 'Enable trigger' },
  { value: 'notify', label: 'Notification' },
];

export interface TriggerAction {
  type: TriggerActionType;
  value: string;
}

export interface TriggerCondition {
  capture: string;
  operator: ConditionOperator;
  value: string | number | (string | number)[];
}

export interface TriggerDefinition {
  name: string;
  /** Pattern group names to match against (OR logic - any pattern in any group fires) */
  patternGroups: string[];
  /** @deprecated Inline patterns - for migration only */
  patterns?: string[];
  conditions?: TriggerCondition[];
  actions: TriggerAction[];
  /** @deprecated Use actions array instead */
  action?: string;
  enabled: boolean;
}

export interface TriggersConfig {
  triggers: TriggerDefinition[];
}

const DEFAULT_TRIGGERS: TriggersConfig = {
  triggers: [],
};

async function getTriggersConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'triggers.yaml');
}

/**
 * Parse triggers YAML content.
 *
 * Format:
 *   triggers:
 *     - name: auto-heal
 *       patternGroups:
 *         - status
 *         - combat
 *       conditions:
 *         - capture: status
 *           operator: in
 *           value: [bleeding, stunned]
 *       actions:
 *         - type: send
 *           value: 'cast heal self'
 *       enabled: true
 */
function parseYaml(content: string): TriggersConfig {
  const lines = content.split('\n');
  const triggers: TriggerDefinition[] = [];

  let currentTrigger: Partial<TriggerDefinition & { patterns?: string[] }> | null = null;
  let listContext: 'patternGroups' | 'patterns' | 'conditions' | 'actions' | null = null;
  let currentCondition: Partial<TriggerCondition> | null = null;
  let currentAction: Partial<TriggerAction> | null = null;
  let conditionValueItems: (string | number)[] = [];

  const finishCondition = () => {
    if (currentCondition && currentTrigger) {
      if (!currentTrigger.conditions) currentTrigger.conditions = [];
      if (conditionValueItems.length > 0) {
        currentCondition.value = conditionValueItems;
        conditionValueItems = [];
      }
      currentTrigger.conditions.push(currentCondition as TriggerCondition);
      currentCondition = null;
    }
  };

  const finishAction = () => {
    if (currentAction && currentTrigger) {
      if (!currentTrigger.actions) currentTrigger.actions = [];
      if (currentAction.type && currentAction.value !== undefined) {
        currentTrigger.actions.push(currentAction as TriggerAction);
      }
      currentAction = null;
    }
  };

  const finishTrigger = () => {
    finishCondition();
    finishAction();
    if (currentTrigger && currentTrigger.name) {
      // Handle legacy action field
      let actions = currentTrigger.actions || [];
      if (actions.length === 0 && currentTrigger.action) {
        actions = [{ type: 'send', value: currentTrigger.action }];
      }
      triggers.push({
        name: currentTrigger.name,
        patternGroups: currentTrigger.patternGroups || [],
        patterns: currentTrigger.patterns, // Keep for migration
        conditions: currentTrigger.conditions,
        actions,
        enabled: currentTrigger.enabled !== false,
      });
    }
    currentTrigger = null;
    listContext = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top level 'triggers:' key
    if (line.match(/^triggers:\s*$/)) continue;

    // New trigger item: "  - name: ..."
    const newTriggerMatch = line.match(/^  - name:\s*["']?(.+?)["']?\s*$/);
    if (newTriggerMatch) {
      finishTrigger();
      currentTrigger = { name: newTriggerMatch[1], patternGroups: [] };
      listContext = null;
      continue;
    }

    if (!currentTrigger) continue;

    // Trigger properties at 4-space indent
    const propMatch = line.match(/^    (\w+):\s*(.*)$/);
    if (propMatch && !line.match(/^      /)) {
      const [, key, rawValue] = propMatch;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();

      switch (key) {
        case 'patternGroups':
          listContext = 'patternGroups';
          continue;
        case 'patterns':
          // Legacy inline patterns
          listContext = 'patterns';
          if (!currentTrigger.patterns) currentTrigger.patterns = [];
          continue;
        case 'conditions':
          listContext = 'conditions';
          continue;
        case 'actions':
          listContext = 'actions';
          continue;
        case 'action':
          // Legacy single action field
          currentTrigger.action = value;
          listContext = null;
          continue;
        case 'enabled':
          currentTrigger.enabled = value !== 'false';
          listContext = null;
          continue;
      }
    }

    // List items at 6-space indent
    if (listContext === 'patternGroups') {
      const groupMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (groupMatch) {
        currentTrigger.patternGroups!.push(groupMatch[1]);
        continue;
      }
    }

    if (listContext === 'patterns') {
      const patternMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (patternMatch) {
        if (!currentTrigger.patterns) currentTrigger.patterns = [];
        currentTrigger.patterns.push(patternMatch[1]);
        continue;
      }
    }

    if (listContext === 'conditions') {
      // New condition: "      - capture: ..."
      const condStartMatch = line.match(/^\s{6}- capture:\s*["']?(.+?)["']?\s*$/);
      if (condStartMatch) {
        finishCondition();
        currentCondition = { capture: condStartMatch[1] };
        conditionValueItems = [];
        continue;
      }

      if (currentCondition) {
        // Condition operator
        const operatorMatch = line.match(/^\s{8}operator:\s*["']?(.+?)["']?\s*$/);
        if (operatorMatch) {
          currentCondition.operator = operatorMatch[1] as ConditionOperator;
          continue;
        }

        // Condition value — inline array: value: [a, b, c]
        const inlineArrayMatch = line.match(/^\s{8}value:\s*\[(.+)\]\s*$/);
        if (inlineArrayMatch) {
          currentCondition.value = inlineArrayMatch[1]
            .split(',')
            .map(v => v.trim().replace(/^["']|["']$/g, ''))
            .map(v => { const n = Number(v); return isNaN(n) ? v : n; });
          continue;
        }

        // Condition value — scalar: value: something
        const scalarMatch = line.match(/^\s{8}value:\s*["']?(.+?)["']?\s*$/);
        if (scalarMatch) {
          const raw = scalarMatch[1];
          const num = Number(raw);
          currentCondition.value = isNaN(num) ? raw : num;
          continue;
        }

        // Condition value — block list start: value:
        if (line.match(/^\s{8}value:\s*$/)) {
          conditionValueItems = [];
          continue;
        }

        // Condition value list item: "          - item"
        const valueItemMatch = line.match(/^\s{10}-\s*["']?(.+?)["']?\s*$/);
        if (valueItemMatch) {
          const raw = valueItemMatch[1];
          const num = Number(raw);
          conditionValueItems.push(isNaN(num) ? raw : num);
          continue;
        }
      }
    }

    if (listContext === 'actions') {
      // New action: "      - type: send"
      const actionStartMatch = line.match(/^\s{6}- type:\s*["']?(.+?)["']?\s*$/);
      if (actionStartMatch) {
        finishAction();
        currentAction = { type: actionStartMatch[1] as TriggerActionType };
        continue;
      }

      if (currentAction) {
        // Action value
        const valueMatch = line.match(/^\s{8}value:\s*["']?(.+?)["']?\s*$/);
        if (valueMatch) {
          currentAction.value = valueMatch[1];
          continue;
        }
      }
    }
  }

  finishTrigger();
  return { triggers };
}

function escapeYamlString(str: string): string {
  return str.replace(/'/g, "''");
}

function stringifyYaml(config: TriggersConfig): string {
  const lines: string[] = ['triggers:'];

  if (config.triggers.length === 0) {
    lines.push('  []');
    return lines.join('\n') + '\n';
  }

  for (const trigger of config.triggers) {
    lines.push(`  - name: '${escapeYamlString(trigger.name)}'`);

    // Pattern groups
    lines.push('    patternGroups:');
    if (trigger.patternGroups.length === 0) {
      lines.push('      []');
    } else {
      for (const group of trigger.patternGroups) {
        lines.push(`      - '${escapeYamlString(group)}'`);
      }
    }

    // Conditions (filter out empty ones)
    const validConditions = (trigger.conditions || []).filter(c => c.capture && c.capture.trim() !== '');
    if (validConditions.length > 0) {
      lines.push('    conditions:');
      for (const condition of validConditions) {
        lines.push(`      - capture: '${escapeYamlString(condition.capture)}'`);
        lines.push(`        operator: ${condition.operator}`);
        if (Array.isArray(condition.value)) {
          const items = condition.value.map(v =>
            typeof v === 'number' ? String(v) : `'${escapeYamlString(String(v))}'`
          ).join(', ');
          lines.push(`        value: [${items}]`);
        } else if (typeof condition.value === 'number') {
          lines.push(`        value: ${condition.value}`);
        } else {
          lines.push(`        value: '${escapeYamlString(String(condition.value))}'`);
        }
      }
    }

    // Actions
    const validActions = (trigger.actions || []).filter(a => a.value && a.value.trim() !== '');
    if (validActions.length > 0) {
      lines.push('    actions:');
      for (const action of validActions) {
        lines.push(`      - type: ${action.type}`);
        lines.push(`        value: '${escapeYamlString(action.value)}'`);
      }
    }

    lines.push(`    enabled: ${trigger.enabled}`);
  }

  return lines.join('\n') + '\n';
}

export async function loadTriggersConfig(): Promise<TriggersConfig> {
  try {
    const configPath = await getTriggersConfigPath();
    const fileExists = await exists(configPath);

    if (fileExists) {
      const content = await readTextFile(configPath);
      return parseYaml(content);
    }

    return DEFAULT_TRIGGERS;
  } catch (error) {
    console.warn('Failed to load triggers config:', error);
    return DEFAULT_TRIGGERS;
  }
}

export async function saveTriggersConfig(config: TriggersConfig): Promise<void> {
  try {
    const configPath = await getTriggersConfigPath();
    await writeTextFile(configPath, stringifyYaml(config));
  } catch (error) {
    console.error('Failed to save triggers config:', error);
    throw error;
  }
}

export async function resetTriggersConfig(): Promise<TriggersConfig> {
  await saveTriggersConfig(DEFAULT_TRIGGERS);
  return DEFAULT_TRIGGERS;
}
