/**
 * Patterns config store service for mud-client pattern settings
 * Reads/writes ~/.config/mud-client/patterns.yaml
 * Handles migration from panes.yaml classifiers section
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export interface PatternsConfig {
  groups: Record<string, string[]>;
  continuation?: string;
}

const DEFAULT_PATTERNS: PatternsConfig = {
  groups: {},
};

async function getPatternsConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'patterns.yaml');
}

async function getPanesConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'panes.yaml');
}

/**
 * Validate a regex pattern string
 * @returns null if valid, error message if invalid
 */
export function validateRegex(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid regex';
  }
}

/**
 * Parse YAML content to PatternsConfig
 * Handles both new format (groups: {...}) and old format (tell: [...])
 */
function parseYaml(content: string): PatternsConfig {
  const lines = content.split('\n');
  const result: PatternsConfig = { groups: {} };

  // Check if this is the new format (starts with 'groups:') or old format
  const hasGroupsKey = lines.some(line => line.match(/^groups:\s*$/));

  let currentGroup: string | null = null;
  let inGroups = hasGroupsKey ? false : true; // Old format = already "in groups"

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // New format: explicit 'groups:' section
    if (line.match(/^groups:\s*$/)) {
      inGroups = true;
      continue;
    }

    // Continuation pattern (both formats)
    if (line.match(/^continuation:/)) {
      currentGroup = null;
      const match = line.match(/^continuation:\s*["']?(.+?)["']?\s*$/);
      if (match) {
        result.continuation = match[1];
      }
      continue;
    }

    // Skip channelContent in old format (was for sender extraction)
    if (line.match(/^channelContent:\s*$/)) {
      currentGroup = null;
      continue;
    }

    if (inGroups) {
      // Group name at appropriate indentation level
      // New format: 2 spaces (under groups:), Old format: 0 spaces (top level)
      const groupMatch = hasGroupsKey
        ? line.match(/^  (\w+):\s*$/)
        : line.match(/^(\w+):\s*$/);

      if (groupMatch) {
        currentGroup = groupMatch[1];
        if (!result.groups[currentGroup]) {
          result.groups[currentGroup] = [];
        }
        continue;
      }

      // Pattern within group
      if (currentGroup) {
        // New format: "    - 'pattern'" (4 spaces, direct pattern string)
        // Old format: "  - pattern: 'value'" (2 spaces, object with pattern key)
        const indent = hasGroupsKey ? 4 : 2;
        const indentRegex = new RegExp(`^\\s{${indent}}-`);

        if (line.match(indentRegex)) {
          // Check if it's old format (has 'pattern:' key)
          const oldFormatMatch = line.match(/pattern:\s*["']?(.+?)["']?\s*$/);
          if (oldFormatMatch) {
            result.groups[currentGroup].push(oldFormatMatch[1]);
          } else {
            // New format - direct pattern string
            const newFormatMatch = line.match(new RegExp(`^\\s{${indent}}-\\s*["']?(.+?)["']?\\s*$`));
            if (newFormatMatch) {
              result.groups[currentGroup].push(newFormatMatch[1]);
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Parse classifiers section from old panes.yaml format
 */
function parseClassifiersFromPanesYaml(content: string): PatternsConfig | null {
  const lines = content.split('\n');
  const groups: Record<string, string[]> = {};

  let inClassifiers = false;
  let currentSection: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Enter classifiers section
    if (line.match(/^classifiers:/)) {
      inClassifiers = true;
      continue;
    }

    // Exit classifiers section when we hit panes
    if (line.match(/^panes:/)) {
      break;
    }

    if (!inClassifiers) continue;

    // Sub-sections within classifiers (tell, say, channel)
    const sectionMatch = line.match(/^  (\w+):\s*$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      // Skip channelContent as it was for sender extraction
      if (section !== 'channelContent' && section !== 'continuation') {
        currentSection = section;
        if (!groups[currentSection]) {
          groups[currentSection] = [];
        }
      } else {
        currentSection = null;
      }
      continue;
    }

    // Pattern within section (old format: - pattern: "...")
    if (currentSection && line.match(/^    -\s+pattern:/)) {
      const patternMatch = line.match(/pattern:\s*["']?(.+?)["']?\s*$/);
      if (patternMatch) {
        groups[currentSection].push(patternMatch[1]);
      }
    }
  }

  // Check if we found any patterns
  const hasPatterns = Object.values(groups).some(arr => arr.length > 0);

  return hasPatterns ? { groups } : null;
}

/**
 * Stringify patterns config to YAML
 */
function stringifyYaml(config: PatternsConfig): string {
  const lines: string[] = [];

  lines.push('groups:');

  const groupNames = Object.keys(config.groups).sort();

  if (groupNames.length === 0) {
    lines.push('  {}');
  } else {
    for (const name of groupNames) {
      const patterns = config.groups[name];
      lines.push(`  ${name}:`);
      if (patterns.length === 0) {
        lines.push('    []');
      } else {
        for (const pattern of patterns) {
          lines.push(`    - '${escapeYamlString(pattern)}'`);
        }
      }
    }
  }

  if (config.continuation) {
    lines.push('');
    lines.push(`continuation: '${escapeYamlString(config.continuation)}'`);
  }

  return lines.join('\n') + '\n';
}

function escapeYamlString(str: string): string {
  // Escape single quotes by doubling them
  return str.replace(/'/g, "''");
}

/**
 * Load patterns config from ~/.config/mud-client/patterns.yaml
 * Falls back to migrating from panes.yaml if patterns.yaml doesn't exist
 */
export async function loadPatternsConfig(): Promise<PatternsConfig> {
  try {
    const patternsPath = await getPatternsConfigPath();
    const patternsExists = await exists(patternsPath);

    if (patternsExists) {
      const content = await readTextFile(patternsPath);
      return parseYaml(content);
    }

    // Try migrating from panes.yaml
    const panesPath = await getPanesConfigPath();
    const panesExists = await exists(panesPath);

    if (panesExists) {
      const content = await readTextFile(panesPath);
      const migrated = parseClassifiersFromPanesYaml(content);
      if (migrated) {
        return migrated;
      }
    }

    return DEFAULT_PATTERNS;
  } catch (error) {
    console.warn('Failed to load patterns config:', error);
    return DEFAULT_PATTERNS;
  }
}

/**
 * Save patterns config to ~/.config/mud-client/patterns.yaml
 */
export async function savePatternsConfig(config: PatternsConfig): Promise<void> {
  try {
    const configPath = await getPatternsConfigPath();
    await writeTextFile(configPath, stringifyYaml(config));
  } catch (error) {
    console.error('Failed to save patterns config:', error);
    throw error;
  }
}

/**
 * Reset patterns to defaults (empty)
 */
export async function resetPatternsConfig(): Promise<PatternsConfig> {
  await savePatternsConfig(DEFAULT_PATTERNS);
  return DEFAULT_PATTERNS;
}
