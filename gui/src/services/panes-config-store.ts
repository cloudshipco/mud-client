/**
 * Panes config store service for mud-client pane settings
 * Reads/writes ~/.config/mud-client/panes.yaml
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export interface PaneFilter {
  patterns?: string[];
  excludePatterns?: string[];
  pattern?: string;
}

export interface PaneConfig {
  id: string;
  enabled?: boolean;
  position: 'top';
  height: number;
  filter: PaneFilter;
  maxMessages?: number;
  passthrough?: boolean;
}

export interface PanesConfig {
  panes: PaneConfig[];
}

async function getConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'panes.yaml');
}

/**
 * Simple YAML parser for panes.yaml
 * Handles the subset of YAML we need including multi-line arrays
 */
function parseYaml(content: string): PanesConfig {
  const lines = content.split('\n');
  const result: PanesConfig = { panes: [] };

  let currentSection: string | null = null;
  let currentPane: Partial<PaneConfig> | null = null;
  let currentFilter: PaneFilter | null = null;
  let currentArrayKey: 'patterns' | 'excludePatterns' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Skip classifiers section (now in patterns.yaml)
    if (line.startsWith('classifiers:')) {
      currentSection = 'classifiers';
      continue;
    }

    if (line.startsWith('panes:')) {
      currentSection = 'panes';
      continue;
    }

    // Skip classifiers content
    if (currentSection === 'classifiers' && !line.startsWith('panes:')) {
      continue;
    }

    // Parse panes section
    if (currentSection === 'panes') {
      // New pane entry (starts with "  - id:")
      if (line.match(/^\s{2}-\s+id:/)) {
        if (currentPane && currentPane.id) {
          currentPane.filter = currentFilter || {};
          result.panes.push(currentPane as PaneConfig);
        }
        currentPane = { position: 'top' };
        currentFilter = {};
        currentArrayKey = null;
        const match = line.match(/id:\s*["']?([^"'\s]+)["']?/);
        if (match) currentPane.id = match[1];
        continue;
      }

      if (!currentPane) continue;

      // Check for array item (8 spaces + dash for filter arrays)
      if (line.match(/^\s{8}-\s+/) && currentArrayKey && currentFilter) {
        const value = trimmed.replace(/^-\s*/, '').replace(/['"]/g, '');
        if (!currentFilter[currentArrayKey]) {
          currentFilter[currentArrayKey] = [];
        }
        currentFilter[currentArrayKey]!.push(value);
        continue;
      }

      // Reset array key when we hit a non-array line at filter level
      if (line.match(/^\s{6}\w/) && !line.match(/^\s{8}/)) {
        currentArrayKey = null;
      }

      // Pane properties
      if (line.match(/^\s{4}enabled:/)) {
        currentPane.enabled = line.includes('true');
      } else if (line.match(/^\s{4}position:/)) {
        const match = line.match(/position:\s*["']?([^"'\s]+)["']?/);
        if (match) currentPane.position = match[1] as 'top';
      } else if (line.match(/^\s{4}height:/)) {
        const match = line.match(/height:\s*(\d+(?:\.\d+)?)/);
        if (match) currentPane.height = parseFloat(match[1]);
      } else if (line.match(/^\s{4}maxMessages:/)) {
        const match = line.match(/maxMessages:\s*(\d+)/);
        if (match) currentPane.maxMessages = parseInt(match[1], 10);
      } else if (line.match(/^\s{4}passthrough:/)) {
        currentPane.passthrough = line.includes('true');
      } else if (line.match(/^\s{4}filter:/)) {
        currentFilter = {};
      } else if (line.match(/^\s{6}(patterns|types):/)) {
        // Support both 'patterns' (new) and 'types' (old) for backward compat
        const inlineMatch = line.match(/(patterns|types):\s*\[([^\]]*)\]/);
        if (inlineMatch) {
          currentFilter!.patterns = inlineMatch[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        } else {
          currentArrayKey = 'patterns';
          currentFilter!.patterns = [];
        }
      } else if (line.match(/^\s{6}(excludePatterns|excludeChannels):/)) {
        // Support both 'excludePatterns' (new) and 'excludeChannels' (old)
        const inlineMatch = line.match(/(excludePatterns|excludeChannels):\s*\[([^\]]*)\]/);
        if (inlineMatch) {
          currentFilter!.excludePatterns = inlineMatch[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        } else {
          currentArrayKey = 'excludePatterns';
          currentFilter!.excludePatterns = [];
        }
      } else if (line.match(/^\s{6}channels:/)) {
        // Migrate old 'channels' to 'patterns' (channel names were pattern group names)
        const inlineMatch = line.match(/channels:\s*\[([^\]]*)\]/);
        if (inlineMatch) {
          const channels = inlineMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
          if (!currentFilter!.patterns) currentFilter!.patterns = [];
          currentFilter!.patterns.push(...channels);
        }
      } else if (line.match(/^\s{6}pattern:/)) {
        const match = line.match(/pattern:\s*["']?(.+?)["']?\s*$/);
        if (match) currentFilter!.pattern = match[1];
      }
    }
  }

  // Add last pane
  if (currentPane && currentPane.id) {
    currentPane.filter = currentFilter || {};
    result.panes.push(currentPane as PaneConfig);
  }

  return result;
}

/**
 * Serialize panes config back to YAML
 */
function stringifyYaml(config: PanesConfig): string {
  const lines: string[] = [];

  lines.push('panes:');

  for (const pane of config.panes) {
    lines.push(`  - id: ${pane.id}`);
    if (pane.enabled !== undefined) {
      lines.push(`    enabled: ${pane.enabled}`);
    }
    lines.push(`    position: ${pane.position}`);
    lines.push(`    height: ${pane.height}`);
    if (pane.maxMessages !== undefined) {
      lines.push(`    maxMessages: ${pane.maxMessages}`);
    }
    if (pane.passthrough !== undefined) {
      lines.push(`    passthrough: ${pane.passthrough}`);
    }
    lines.push('    filter:');
    if (pane.filter.patterns && pane.filter.patterns.length > 0) {
      lines.push(`      patterns: [${pane.filter.patterns.join(', ')}]`);
    }
    if (pane.filter.excludePatterns && pane.filter.excludePatterns.length > 0) {
      lines.push(`      excludePatterns: [${pane.filter.excludePatterns.join(', ')}]`);
    }
    if (pane.filter.pattern) {
      lines.push(`      pattern: '${pane.filter.pattern}'`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Load panes config from ~/.config/mud-client/panes.yaml
 */
export async function loadPanesConfig(): Promise<PanesConfig | null> {
  try {
    const configPath = await getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      return null; // No panes configured
    }

    const content = await readTextFile(configPath);
    return parseYaml(content);
  } catch (error) {
    console.warn('Failed to load panes config:', error);
    return null;
  }
}

/**
 * Save panes config to ~/.config/mud-client/panes.yaml
 */
export async function savePanesConfig(config: PanesConfig): Promise<void> {
  try {
    const configPath = await getConfigPath();
    await writeTextFile(configPath, stringifyYaml(config));
  } catch (error) {
    console.error('Failed to save panes config:', error);
    throw error;
  }
}

/**
 * Update a single pane's settings
 */
export function updatePane(
  config: PanesConfig,
  paneId: string,
  updates: Partial<Pick<PaneConfig, 'enabled' | 'height' | 'passthrough' | 'maxMessages'>>
): PanesConfig {
  return {
    ...config,
    panes: config.panes.map(pane =>
      pane.id === paneId ? { ...pane, ...updates } : pane
    ),
  };
}

/**
 * Update a pane's pattern filter
 */
export function updatePanePatterns(
  config: PanesConfig,
  paneId: string,
  patterns: string[]
): PanesConfig {
  return {
    ...config,
    panes: config.panes.map(pane =>
      pane.id === paneId
        ? { ...pane, filter: { ...pane.filter, patterns: patterns.length > 0 ? patterns : undefined } }
        : pane
    ),
  };
}
