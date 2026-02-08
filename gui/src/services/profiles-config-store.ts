/**
 * Profiles config store service for mud-client profile management
 * Reads/writes ~/.config/mud-client/profiles/profiles.yaml
 *
 * Profiles act as selectors from a global pool of items (triggers, aliases, etc.)
 * rather than containers. A character can be assigned to a profile to limit
 * which items are active for that character.
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

/**
 * Profile definition - a named selection of items from the global pool
 */
export interface ProfileConfig {
  id: string;              // Unique slug (e.g., "mage-combat")
  name: string;            // Display name
  description?: string;

  // IDs/names of items to include (empty = none, undefined = all)
  triggers?: string[];     // Trigger names to include
  aliases?: string[];      // Alias keys to include
  timers?: string[];       // Timer names to include
  patternGroups?: string[];// Pattern group names to include
  panes?: string[];        // Pane IDs to include
  gauges?: string[];       // Gauge variable names to include

  createdAt: number;
  updatedAt: number;
}

export interface ProfilesConfig {
  profiles: ProfileConfig[];
}

const DEFAULT_PROFILES: ProfilesConfig = {
  profiles: [],
};

async function getProfilesConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'profiles', 'profiles.yaml');
}

async function getProfilesDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'profiles');
}

/**
 * Parse profiles YAML content.
 *
 * Format:
 *   profiles:
 *     - id: mage-combat
 *       name: Mage Combat Setup
 *       description: Triggers and panes for mage gameplay
 *       triggers: [auto-heal, buff-check]
 *       aliases: [heal, buff]
 *       timers: [regen-check]
 *       patternGroups: [combat, tells]
 *       panes: [combat, comms]
 *       gauges: [hp, mana]
 *       createdAt: 1234567890
 *       updatedAt: 1234567890
 */
function parseYaml(content: string): ProfilesConfig {
  const lines = content.split('\n');
  const profiles: ProfileConfig[] = [];

  let currentProfile: Partial<ProfileConfig> | null = null;
  let listContext: 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges' | null = null;

  const finishProfile = () => {
    if (currentProfile && currentProfile.id && currentProfile.name) {
      profiles.push({
        id: currentProfile.id,
        name: currentProfile.name,
        description: currentProfile.description,
        triggers: currentProfile.triggers,
        aliases: currentProfile.aliases,
        timers: currentProfile.timers,
        patternGroups: currentProfile.patternGroups,
        panes: currentProfile.panes,
        gauges: currentProfile.gauges,
        createdAt: currentProfile.createdAt || Date.now(),
        updatedAt: currentProfile.updatedAt || Date.now(),
      });
    }
    currentProfile = null;
    listContext = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top level 'profiles:' key
    if (line.match(/^profiles:\s*$/)) continue;

    // Empty array marker
    if (line.match(/^  \[\]\s*$/)) continue;

    // New profile item: "  - id: ..."
    const newProfileMatch = line.match(/^  - id:\s*["']?(.+?)["']?\s*$/);
    if (newProfileMatch) {
      finishProfile();
      currentProfile = { id: newProfileMatch[1] };
      listContext = null;
      continue;
    }

    if (!currentProfile) continue;

    // Profile properties at 4-space indent
    const propMatch = line.match(/^    (\w+):\s*(.*)$/);
    if (propMatch && !line.match(/^      /)) {
      const [, key, rawValue] = propMatch;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();

      // Handle inline array format: [item1, item2, ...]
      const inlineArrayMatch = rawValue.match(/^\[(.+)\]\s*$/);
      if (inlineArrayMatch && ['triggers', 'aliases', 'timers', 'patternGroups', 'panes', 'gauges'].includes(key)) {
        const items = inlineArrayMatch[1]
          .split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''))
          .filter(v => v !== '');
        (currentProfile as any)[key] = items;
        listContext = null;
        continue;
      }

      // Handle empty array marker: []
      if (rawValue.trim() === '[]' && ['triggers', 'aliases', 'timers', 'patternGroups', 'panes', 'gauges'].includes(key)) {
        (currentProfile as any)[key] = [];
        listContext = null;
        continue;
      }

      switch (key) {
        case 'name':
          currentProfile.name = value;
          listContext = null;
          continue;
        case 'description':
          currentProfile.description = value;
          listContext = null;
          continue;
        case 'createdAt':
          currentProfile.createdAt = parseInt(value, 10) || Date.now();
          listContext = null;
          continue;
        case 'updatedAt':
          currentProfile.updatedAt = parseInt(value, 10) || Date.now();
          listContext = null;
          continue;
        case 'triggers':
        case 'aliases':
        case 'timers':
        case 'patternGroups':
        case 'panes':
        case 'gauges':
          listContext = key;
          if (!(currentProfile as any)[key]) {
            (currentProfile as any)[key] = [];
          }
          continue;
      }
    }

    // List items at 6-space indent
    if (listContext) {
      const itemMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (itemMatch) {
        const arr = (currentProfile as any)[listContext];
        if (arr) {
          arr.push(itemMatch[1]);
        }
        continue;
      }
    }
  }

  finishProfile();
  return { profiles };
}

function escapeYamlString(str: string): string {
  return str.replace(/'/g, "''");
}

function stringifyYaml(config: ProfilesConfig): string {
  const lines: string[] = ['profiles:'];

  if (config.profiles.length === 0) {
    lines.push('  []');
    return lines.join('\n') + '\n';
  }

  for (const profile of config.profiles) {
    lines.push(`  - id: '${escapeYamlString(profile.id)}'`);
    lines.push(`    name: '${escapeYamlString(profile.name)}'`);

    if (profile.description) {
      lines.push(`    description: '${escapeYamlString(profile.description)}'`);
    }

    // Serialize arrays - use inline format for readability
    const serializeArray = (key: string, arr: string[] | undefined) => {
      if (arr === undefined) {
        // undefined means "all" - don't include in YAML
        return;
      }
      if (arr.length === 0) {
        lines.push(`    ${key}: []`);
      } else {
        const items = arr.map(v => `'${escapeYamlString(v)}'`).join(', ');
        lines.push(`    ${key}: [${items}]`);
      }
    };

    serializeArray('triggers', profile.triggers);
    serializeArray('aliases', profile.aliases);
    serializeArray('timers', profile.timers);
    serializeArray('patternGroups', profile.patternGroups);
    serializeArray('panes', profile.panes);
    serializeArray('gauges', profile.gauges);

    lines.push(`    createdAt: ${profile.createdAt}`);
    lines.push(`    updatedAt: ${profile.updatedAt}`);
  }

  return lines.join('\n') + '\n';
}

export async function loadProfilesConfig(): Promise<ProfilesConfig> {
  try {
    const configPath = await getProfilesConfigPath();
    const fileExists = await exists(configPath);

    if (fileExists) {
      const content = await readTextFile(configPath);
      return parseYaml(content);
    }

    return DEFAULT_PROFILES;
  } catch (error) {
    console.warn('Failed to load profiles config:', error);
    return DEFAULT_PROFILES;
  }
}

export async function saveProfilesConfig(config: ProfilesConfig): Promise<void> {
  try {
    const profilesDir = await getProfilesDir();
    const dirExists = await exists(profilesDir);
    if (!dirExists) {
      await mkdir(profilesDir, { recursive: true });
    }

    const configPath = await getProfilesConfigPath();
    await writeTextFile(configPath, stringifyYaml(config));
  } catch (error) {
    console.error('Failed to save profiles config:', error);
    throw error;
  }
}

export async function resetProfilesConfig(): Promise<ProfilesConfig> {
  await saveProfilesConfig(DEFAULT_PROFILES);
  return DEFAULT_PROFILES;
}

/**
 * Create a unique slug from a name
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique profile ID
 */
export function generateProfileId(name: string, existingIds: string[]): string {
  const baseId = slugify(name);
  if (!existingIds.includes(baseId)) {
    return baseId;
  }

  let counter = 1;
  while (existingIds.includes(`${baseId}-${counter}`)) {
    counter++;
  }
  return `${baseId}-${counter}`;
}

/**
 * Create a new profile
 */
export function createProfile(
  config: ProfilesConfig,
  name: string,
  description?: string
): ProfileConfig {
  const existingIds = config.profiles.map(p => p.id);
  const id = generateProfileId(name, existingIds);
  const now = Date.now();

  const profile: ProfileConfig = {
    id,
    name,
    description,
    // All undefined = include all items
    triggers: undefined,
    aliases: undefined,
    timers: undefined,
    patternGroups: undefined,
    panes: undefined,
    gauges: undefined,
    createdAt: now,
    updatedAt: now,
  };

  config.profiles.push(profile);
  return profile;
}

/**
 * Duplicate a profile with a new name
 */
export function duplicateProfile(
  config: ProfilesConfig,
  profileId: string,
  newName?: string
): ProfileConfig | null {
  const original = config.profiles.find(p => p.id === profileId);
  if (!original) return null;

  const existingIds = config.profiles.map(p => p.id);
  const name = newName || `${original.name} (copy)`;
  const id = generateProfileId(name, existingIds);
  const now = Date.now();

  const duplicate: ProfileConfig = {
    ...JSON.parse(JSON.stringify(original)),
    id,
    name,
    createdAt: now,
    updatedAt: now,
  };

  config.profiles.push(duplicate);
  return duplicate;
}

/**
 * Delete a profile by ID
 */
export function deleteProfile(config: ProfilesConfig, profileId: string): boolean {
  const index = config.profiles.findIndex(p => p.id === profileId);
  if (index === -1) return false;
  config.profiles.splice(index, 1);
  return true;
}

/**
 * Get a profile by ID
 */
export function getProfile(config: ProfilesConfig, profileId: string): ProfileConfig | null {
  return config.profiles.find(p => p.id === profileId) || null;
}

/**
 * Check if an item is included in a profile.
 * Returns true if:
 * - The profile's array for this type is undefined (meaning "all")
 * - The profile's array contains the item name
 */
export function isItemIncludedInProfile(
  profile: ProfileConfig,
  itemType: 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges',
  itemName: string
): boolean {
  const arr = profile[itemType];
  // undefined means "include all"
  if (arr === undefined) return true;
  return arr.includes(itemName);
}

/**
 * Get list of profile names that include a given item
 */
export function getProfilesContainingItem(
  config: ProfilesConfig,
  itemType: 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges',
  itemName: string
): string[] {
  return config.profiles
    .filter(p => isItemIncludedInProfile(p, itemType, itemName))
    .map(p => p.name);
}

/**
 * Filter an array of items by profile.
 * If profileId is undefined or profile not found, returns all items.
 */
export function filterItemsByProfile<T extends { name: string }>(
  items: T[],
  profile: ProfileConfig | null,
  itemType: 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges'
): T[] {
  if (!profile) return items;

  const arr = profile[itemType];
  // undefined means "include all"
  if (arr === undefined) return items;

  return items.filter(item => arr.includes(item.name));
}

/**
 * Filter a map of items by profile (for aliases which are key-value pairs)
 */
export function filterAliasesByProfile(
  aliases: Record<string, string>,
  profile: ProfileConfig | null
): Record<string, string> {
  if (!profile) return aliases;

  const arr = profile.aliases;
  // undefined means "include all"
  if (arr === undefined) return aliases;

  const filtered: Record<string, string> = {};
  for (const key of arr) {
    if (key in aliases) {
      filtered[key] = aliases[key];
    }
  }
  return filtered;
}
