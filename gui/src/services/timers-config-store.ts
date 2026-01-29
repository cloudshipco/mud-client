/**
 * Timers config store service for mud-client timer settings
 * Reads/writes ~/.config/mud-client/timers.yaml
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';
import type { TriggerAction, TriggerActionType } from './triggers-config-store';

export type { TriggerAction, TriggerActionType };

export interface TimerDefinition {
  name: string;
  enabled: boolean;
  interval: number;      // seconds
  actions: TriggerAction[];  // actions to execute each tick
  /** @deprecated Use actions array instead */
  commands?: string[];
}

export interface TimersConfig {
  timers: TimerDefinition[];
}

const DEFAULT_TIMERS: TimersConfig = {
  timers: [],
};

async function getTimersConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'timers.yaml');
}

/**
 * Parse timers YAML content.
 *
 * Format:
 *   timers:
 *     - name: auto-save
 *       enabled: true
 *       interval: 300
 *       actions:
 *         - type: send
 *           value: save
 *       # Legacy format also supported:
 *       commands:
 *         - save
 */
function parseYaml(content: string): TimersConfig {
  const lines = content.split('\n');
  const timers: TimerDefinition[] = [];

  let currentTimer: Partial<TimerDefinition & { commands?: string[] }> | null = null;
  let currentAction: Partial<TriggerAction> | null = null;
  let listContext: 'commands' | 'actions' | null = null;

  const finishAction = () => {
    if (currentAction && currentTimer) {
      if (!currentTimer.actions) currentTimer.actions = [];
      // set_variable actions need name/capture, others need value
      if (currentAction.type === 'set_variable') {
        if (currentAction.name && currentAction.capture) {
          currentTimer.actions.push(currentAction as TriggerAction);
        }
      } else if (currentAction.type && currentAction.value !== undefined) {
        currentTimer.actions.push(currentAction as TriggerAction);
      }
      currentAction = null;
    }
  };

  const finishTimer = () => {
    finishAction();
    if (currentTimer && currentTimer.name) {
      // Convert legacy commands to actions
      let actions = currentTimer.actions || [];
      if (actions.length === 0 && currentTimer.commands && currentTimer.commands.length > 0) {
        actions = currentTimer.commands.map(cmd => ({ type: 'send' as TriggerActionType, value: cmd }));
      }
      timers.push({
        name: currentTimer.name,
        enabled: currentTimer.enabled !== false,
        interval: typeof currentTimer.interval === 'number' ? currentTimer.interval : 60,
        actions,
      });
    }
    currentTimer = null;
    listContext = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top level 'timers:' key
    if (line.match(/^timers:\s*$/)) continue;

    // New timer item: "  - name: ..."
    const newTimerMatch = line.match(/^  - name:\s*["']?(.+?)["']?\s*$/);
    if (newTimerMatch) {
      finishTimer();
      currentTimer = { name: newTimerMatch[1], actions: [], commands: [] };
      listContext = null;
      continue;
    }

    if (!currentTimer) continue;

    // Timer properties at 4-space indent
    const propMatch = line.match(/^    (\w+):\s*(.*)$/);
    if (propMatch && !line.match(/^      /)) {
      const [, key, rawValue] = propMatch;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();

      switch (key) {
        case 'enabled':
          currentTimer.enabled = value !== 'false';
          listContext = null;
          continue;
        case 'interval':
          currentTimer.interval = parseInt(value, 10) || 60;
          listContext = null;
          continue;
        case 'commands':
          // Legacy format
          listContext = 'commands';
          if (!currentTimer.commands) currentTimer.commands = [];
          continue;
        case 'actions':
          listContext = 'actions';
          continue;
      }
    }

    // Legacy command list items at 6-space indent
    if (listContext === 'commands') {
      const commandMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (commandMatch) {
        if (!currentTimer.commands) currentTimer.commands = [];
        currentTimer.commands.push(commandMatch[1]);
        continue;
      }
    }

    // Actions list
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
        // set_variable: name field
        const nameMatch = line.match(/^\s{8}name:\s*["']?(.+?)["']?\s*$/);
        if (nameMatch) {
          currentAction.name = nameMatch[1];
          continue;
        }
        // set_variable: capture field
        const captureMatch = line.match(/^\s{8}capture:\s*["']?(.+?)["']?\s*$/);
        if (captureMatch) {
          currentAction.capture = captureMatch[1];
          continue;
        }
      }
    }
  }

  finishTimer();
  return { timers };
}

function escapeYamlString(str: string): string {
  return str.replace(/'/g, "''");
}

function stringifyYaml(config: TimersConfig): string {
  const lines: string[] = ['timers:'];

  if (config.timers.length === 0) {
    lines.push('  []');
    return lines.join('\n') + '\n';
  }

  for (const timer of config.timers) {
    lines.push(`  - name: '${escapeYamlString(timer.name)}'`);
    lines.push(`    enabled: ${timer.enabled}`);
    lines.push(`    interval: ${timer.interval}`);

    // Write actions
    const validActions = (timer.actions || []).filter(a => {
      if (a.type === 'set_variable') {
        return a.name && a.capture;
      }
      return a.value && a.value.trim() !== '';
    });
    if (validActions.length > 0) {
      lines.push('    actions:');
      for (const action of validActions) {
        lines.push(`      - type: ${action.type}`);
        if (action.type === 'set_variable') {
          lines.push(`        name: '${escapeYamlString(action.name || '')}'`);
          lines.push(`        capture: '${escapeYamlString(action.capture || '')}'`);
        } else {
          lines.push(`        value: '${escapeYamlString(action.value)}'`);
        }
      }
    }
  }

  return lines.join('\n') + '\n';
}

export async function loadTimersConfig(): Promise<TimersConfig> {
  try {
    const configPath = await getTimersConfigPath();
    const fileExists = await exists(configPath);

    if (fileExists) {
      const content = await readTextFile(configPath);
      return parseYaml(content);
    }

    return DEFAULT_TIMERS;
  } catch (error) {
    console.warn('Failed to load timers config:', error);
    return DEFAULT_TIMERS;
  }
}

export async function saveTimersConfig(config: TimersConfig): Promise<void> {
  try {
    const configPath = await getTimersConfigPath();
    await writeTextFile(configPath, stringifyYaml(config));
  } catch (error) {
    console.error('Failed to save timers config:', error);
    throw error;
  }
}

export async function resetTimersConfig(): Promise<TimersConfig> {
  await saveTimersConfig(DEFAULT_TIMERS);
  return DEFAULT_TIMERS;
}
