/**
 * Profile Store - manages profile configurations for the CLI backend
 *
 * Profiles act as selectors from a global pool of items (triggers, aliases, etc.)
 * rather than containers. A character can be assigned to a profile to limit
 * which items are active for that character.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

/**
 * Parse profiles YAML content.
 */
function parseYaml(content: string): ProfilesConfig {
  const lines = content.split("\n");
  const profiles: ProfileConfig[] = [];

  let currentProfile: Partial<ProfileConfig> | null = null;
  let listContext: "triggers" | "aliases" | "timers" | "patternGroups" | "panes" | "gauges" | null = null;

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
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (line.match(/^profiles:\s*$/)) continue;
    if (line.match(/^  \[\]\s*$/)) continue;

    const newProfileMatch = line.match(/^  - id:\s*["']?(.+?)["']?\s*$/);
    if (newProfileMatch) {
      finishProfile();
      currentProfile = { id: newProfileMatch[1] };
      listContext = null;
      continue;
    }

    if (!currentProfile) continue;

    const propMatch = line.match(/^    (\w+):\s*(.*)$/);
    if (propMatch && !line.match(/^      /)) {
      const [, key, rawValue] = propMatch;
      const value = rawValue.replace(/^["']|["']$/g, "").trim();

      const inlineArrayMatch = rawValue.match(/^\[(.+)\]\s*$/);
      if (inlineArrayMatch && ["triggers", "aliases", "timers", "patternGroups", "panes", "gauges"].includes(key)) {
        const items = inlineArrayMatch[1]
          .split(",")
          .map((v) => v.trim().replace(/^["']|["']$/g, ""))
          .filter((v) => v !== "");
        (currentProfile as Record<string, unknown>)[key] = items;
        listContext = null;
        continue;
      }

      if (rawValue.trim() === "[]" && ["triggers", "aliases", "timers", "patternGroups", "panes", "gauges"].includes(key)) {
        (currentProfile as Record<string, unknown>)[key] = [];
        listContext = null;
        continue;
      }

      switch (key) {
        case "name":
          currentProfile.name = value;
          listContext = null;
          continue;
        case "description":
          currentProfile.description = value;
          listContext = null;
          continue;
        case "createdAt":
          currentProfile.createdAt = parseInt(value, 10) || Date.now();
          listContext = null;
          continue;
        case "updatedAt":
          currentProfile.updatedAt = parseInt(value, 10) || Date.now();
          listContext = null;
          continue;
        case "triggers":
        case "aliases":
        case "timers":
        case "patternGroups":
        case "panes":
        case "gauges":
          listContext = key;
          if (!(currentProfile as Record<string, unknown>)[key]) {
            (currentProfile as Record<string, unknown>)[key] = [];
          }
          continue;
      }
    }

    if (listContext) {
      const itemMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (itemMatch) {
        const arr = (currentProfile as Record<string, unknown>)[listContext] as string[];
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
  const lines: string[] = ["profiles:"];

  if (config.profiles.length === 0) {
    lines.push("  []");
    return lines.join("\n") + "\n";
  }

  for (const profile of config.profiles) {
    lines.push(`  - id: '${escapeYamlString(profile.id)}'`);
    lines.push(`    name: '${escapeYamlString(profile.name)}'`);

    if (profile.description) {
      lines.push(`    description: '${escapeYamlString(profile.description)}'`);
    }

    const serializeArray = (key: string, arr: string[] | undefined) => {
      if (arr === undefined) return;
      if (arr.length === 0) {
        lines.push(`    ${key}: []`);
      } else {
        const items = arr.map((v) => `'${escapeYamlString(v)}'`).join(", ");
        lines.push(`    ${key}: [${items}]`);
      }
    };

    serializeArray("triggers", profile.triggers);
    serializeArray("aliases", profile.aliases);
    serializeArray("timers", profile.timers);
    serializeArray("patternGroups", profile.patternGroups);
    serializeArray("panes", profile.panes);
    serializeArray("gauges", profile.gauges);

    lines.push(`    createdAt: ${profile.createdAt}`);
    lines.push(`    updatedAt: ${profile.updatedAt}`);
  }

  return lines.join("\n") + "\n";
}

export class ProfileStore {
  private baseDir: string;

  constructor() {
    this.baseDir = join(homedir(), ".config", "mud-client", "profiles");
    this.ensureDir(this.baseDir);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private getConfigPath(): string {
    return join(this.baseDir, "profiles.yaml");
  }

  load(): ProfilesConfig {
    const configPath = this.getConfigPath();

    if (!existsSync(configPath)) {
      return DEFAULT_PROFILES;
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      return parseYaml(content);
    } catch (error) {
      console.warn("Failed to load profiles config:", error);
      return DEFAULT_PROFILES;
    }
  }

  save(config: ProfilesConfig): void {
    this.ensureDir(this.baseDir);
    const configPath = this.getConfigPath();
    writeFileSync(configPath, stringifyYaml(config));
  }

  getProfile(profileId: string): ProfileConfig | null {
    const config = this.load();
    return config.profiles.find((p) => p.id === profileId) || null;
  }

  /**
   * Check if an item is included in a profile.
   * Returns true if the profile's array is undefined (all) or contains the item.
   */
  isItemIncluded(
    profile: ProfileConfig,
    itemType: "triggers" | "aliases" | "timers" | "patternGroups" | "panes" | "gauges",
    itemName: string
  ): boolean {
    const arr = profile[itemType];
    if (arr === undefined) return true;
    return arr.includes(itemName);
  }

  /**
   * Filter an array of items by profile.
   */
  filterItems<T extends { name: string }>(
    items: T[],
    profile: ProfileConfig | null,
    itemType: "triggers" | "aliases" | "timers" | "patternGroups" | "panes" | "gauges"
  ): T[] {
    if (!profile) return items;

    const arr = profile[itemType];
    if (arr === undefined) return items;

    return items.filter((item) => arr.includes(item.name));
  }

  /**
   * Filter aliases (key-value pairs) by profile.
   */
  filterAliases(
    aliases: Record<string, string>,
    profile: ProfileConfig | null
  ): Record<string, string> {
    if (!profile) return aliases;

    const arr = profile.aliases;
    if (arr === undefined) return aliases;

    const filtered: Record<string, string> = {};
    for (const key of arr) {
      if (key in aliases) {
        filtered[key] = aliases[key];
      }
    }
    return filtered;
  }
}
