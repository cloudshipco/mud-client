/**
 * Notifications config store service for mud-client notification settings
 * Reads/writes ~/.config/mud-client/notifications.json
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export interface NotificationsConfig {
  enabled: boolean;
  groups: string[];  // Pattern group names that trigger notifications
}

const DEFAULT_CONFIG: NotificationsConfig = {
  enabled: true,
  groups: [],
};

async function getConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'notifications.json');
}

/**
 * Load notifications config from ~/.config/mud-client/notifications.json
 */
export async function loadNotificationsConfig(): Promise<NotificationsConfig> {
  try {
    const configPath = await getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      return DEFAULT_CONFIG;
    }

    const content = await readTextFile(configPath);
    const parsed = JSON.parse(content) as Partial<NotificationsConfig>;

    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      groups: parsed.groups ?? DEFAULT_CONFIG.groups,
    };
  } catch (error) {
    console.warn('Failed to load notifications config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save notifications config to ~/.config/mud-client/notifications.json
 */
export async function saveNotificationsConfig(config: NotificationsConfig): Promise<void> {
  try {
    const configPath = await getConfigPath();
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save notifications config:', error);
    throw error;
  }
}

/**
 * Reset notifications config to defaults
 */
export async function resetNotificationsConfig(): Promise<NotificationsConfig> {
  await saveNotificationsConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}
