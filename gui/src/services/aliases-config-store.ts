/**
 * Aliases config store service for mud-client aliases
 * Reads/writes ~/.config/mud-client/aliases.json
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export type AliasMap = Record<string, string>;

async function getConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'aliases.json');
}

async function getConfigDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client');
}

/**
 * Load aliases from ~/.config/mud-client/aliases.json
 */
export async function loadAliases(): Promise<AliasMap> {
  try {
    const configPath = await getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      return {};
    }

    const content = await readTextFile(configPath);
    return JSON.parse(content) as AliasMap;
  } catch (error) {
    console.warn('Failed to load aliases:', error);
    return {};
  }
}

/**
 * Save aliases to ~/.config/mud-client/aliases.json
 */
export async function saveAliases(aliases: AliasMap): Promise<void> {
  try {
    const configDir = await getConfigDir();
    const dirExists = await exists(configDir);

    if (!dirExists) {
      await mkdir(configDir, { recursive: true });
    }

    const configPath = await getConfigPath();
    await writeTextFile(configPath, JSON.stringify(aliases, null, 2));
  } catch (error) {
    console.error('Failed to save aliases:', error);
    throw error;
  }
}

/**
 * Reset aliases to empty (defaults)
 */
export async function resetAliases(): Promise<AliasMap> {
  const defaults: AliasMap = {};
  await saveAliases(defaults);
  return defaults;
}
