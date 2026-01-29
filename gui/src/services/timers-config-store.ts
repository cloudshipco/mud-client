/**
 * Timers config store service for mud-client timer settings
 * Reads/writes ~/.config/mud-client/timers.yaml
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export interface TimerDefinition {
  name: string;
  enabled: boolean;
  interval: number;      // seconds
  commands: string[];    // commands to execute each tick
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
 *       commands:
 *         - save
 */
function parseYaml(content: string): TimersConfig {
  const lines = content.split('\n');
  const timers: TimerDefinition[] = [];

  let currentTimer: Partial<TimerDefinition> | null = null;
  let inCommands = false;

  const finishTimer = () => {
    if (currentTimer && currentTimer.name) {
      timers.push({
        name: currentTimer.name,
        enabled: currentTimer.enabled !== false,
        interval: typeof currentTimer.interval === 'number' ? currentTimer.interval : 60,
        commands: currentTimer.commands || [],
      });
    }
    currentTimer = null;
    inCommands = false;
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
      currentTimer = { name: newTimerMatch[1], commands: [] };
      inCommands = false;
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
          inCommands = false;
          continue;
        case 'interval':
          currentTimer.interval = parseInt(value, 10) || 60;
          inCommands = false;
          continue;
        case 'commands':
          inCommands = true;
          if (!currentTimer.commands) currentTimer.commands = [];
          continue;
      }
    }

    // Command list items at 6-space indent
    if (inCommands) {
      const commandMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (commandMatch) {
        if (!currentTimer.commands) currentTimer.commands = [];
        currentTimer.commands.push(commandMatch[1]);
        continue;
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

    lines.push('    commands:');
    if (timer.commands.length === 0) {
      lines.push('      []');
    } else {
      for (const command of timer.commands) {
        lines.push(`      - '${escapeYamlString(command)}'`);
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
