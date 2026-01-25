/**
 * Config store service for mud-client backend settings
 * Reads/writes ~/.config/mud-client/settings.json
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { configDir } from '@tauri-apps/api/path';

export type StatusPosition = 'prompt' | 'right' | 'hidden';
export type TimestampMode = 'hidden' | 'time' | 'datetime';
export type InputMode = 'select' | 'clear';

export interface AppConfig {
  statusPosition: StatusPosition;
  echoCommands: boolean;
  timestamps: TimestampMode;
  autoReconnect: boolean;
  movementKeys: boolean;
  inputMode: InputMode;
  wordWrap: boolean;
  commandSeparator: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  statusPosition: 'right',
  echoCommands: true,
  timestamps: 'hidden',
  autoReconnect: false,
  movementKeys: true,
  inputMode: 'select',
  wordWrap: false,
  commandSeparator: ';;',
};

export const CONFIG_OPTIONS = {
  statusPosition: [
    { value: 'prompt', label: 'In Prompt' },
    { value: 'right', label: 'Right-aligned' },
    { value: 'hidden', label: 'Hidden' },
  ],
  timestamps: [
    { value: 'hidden', label: 'Hidden' },
    { value: 'time', label: 'Time Only' },
    { value: 'datetime', label: 'Date & Time' },
  ],
  inputMode: [
    { value: 'select', label: 'Select Text' },
    { value: 'clear', label: 'Clear Input' },
  ],
} as const;

export const CONFIG_DESCRIPTIONS: Record<keyof AppConfig, string> = {
  statusPosition: 'Where to show username@host status',
  echoCommands: 'Show sent commands in the output area',
  timestamps: 'Add timestamps to messages',
  autoReconnect: 'Automatically reconnect after disconnection',
  movementKeys: 'Enable Shift+HJKL roguelike movement shortcuts',
  inputMode: 'Behavior after sending a command',
  wordWrap: 'Wrap long lines to fit terminal width',
  commandSeparator: 'Separator for chaining commands (e.g., "e;;e;;n")',
};

async function getConfigPath(): Promise<string> {
  const config = await configDir();
  return await join(config, 'mud-client', 'settings.json');
}

async function getConfigDir(): Promise<string> {
  const config = await configDir();
  return await join(config, 'mud-client');
}

function mergeConfig(defaults: AppConfig, saved: Partial<AppConfig>): AppConfig {
  return {
    statusPosition: saved.statusPosition ?? defaults.statusPosition,
    echoCommands: saved.echoCommands ?? defaults.echoCommands,
    timestamps: saved.timestamps ?? defaults.timestamps,
    autoReconnect: saved.autoReconnect ?? defaults.autoReconnect,
    movementKeys: saved.movementKeys ?? defaults.movementKeys,
    inputMode: saved.inputMode ?? defaults.inputMode,
    wordWrap: saved.wordWrap ?? defaults.wordWrap,
    commandSeparator: saved.commandSeparator ?? defaults.commandSeparator,
  };
}

/**
 * Load backend config from ~/.config/mud-client/settings.json
 */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const configPath = await getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      return { ...DEFAULT_CONFIG };
    }

    const content = await readTextFile(configPath);
    const parsed = JSON.parse(content) as Partial<AppConfig>;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error) {
    console.warn('Failed to load config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save backend config to ~/.config/mud-client/settings.json
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    const configDir = await getConfigDir();
    const dirExists = await exists(configDir);

    if (!dirExists) {
      await mkdir(configDir, { recursive: true });
    }

    const configPath = await getConfigPath();
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
    throw error;
  }
}

/**
 * Reset config to defaults
 */
export async function resetConfig(): Promise<AppConfig> {
  const defaults = { ...DEFAULT_CONFIG };
  await saveConfig(defaults);
  return defaults;
}
