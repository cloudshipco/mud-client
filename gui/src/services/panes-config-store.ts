/**
 * Panes config store service for mud-client pane settings
 * Reads/writes ~/.config/mud-client/panes.yaml
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export interface PaneFilter {
  types?: string[];
  channels?: string[];
  excludeChannels?: string[];
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
  classifiers: unknown; // Keep as-is, don't modify
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
  const result: PanesConfig = { classifiers: {}, panes: [] };

  let currentSection: string | null = null;
  let currentPane: Partial<PaneConfig> | null = null;
  let currentFilter: PaneFilter | null = null;
  let inClassifiers = false;
  let classifiersYaml: string[] = [];
  let currentArrayKey: 'types' | 'channels' | 'excludeChannels' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level sections
    if (line.startsWith('classifiers:')) {
      inClassifiers = true;
      classifiersYaml = ['classifiers:'];
      currentSection = 'classifiers';
      continue;
    }

    if (line.startsWith('panes:')) {
      inClassifiers = false;
      currentSection = 'panes';
      continue;
    }

    // Capture classifiers section as-is
    if (inClassifiers && currentSection === 'classifiers') {
      if (!line.startsWith('panes:')) {
        classifiersYaml.push(line);
      }
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
      } else if (line.match(/^\s{6}types:/)) {
        // Check for inline array or start multi-line
        const inlineMatch = line.match(/types:\s*\[([^\]]*)\]/);
        if (inlineMatch) {
          currentFilter!.types = inlineMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        } else {
          currentArrayKey = 'types';
          currentFilter!.types = [];
        }
      } else if (line.match(/^\s{6}channels:/)) {
        const inlineMatch = line.match(/channels:\s*\[([^\]]*)\]/);
        if (inlineMatch) {
          currentFilter!.channels = inlineMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        } else {
          currentArrayKey = 'channels';
          currentFilter!.channels = [];
        }
      } else if (line.match(/^\s{6}excludeChannels:/)) {
        const inlineMatch = line.match(/excludeChannels:\s*\[([^\]]*)\]/);
        if (inlineMatch) {
          currentFilter!.excludeChannels = inlineMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        } else {
          currentArrayKey = 'excludeChannels';
          currentFilter!.excludeChannels = [];
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

  // Store raw classifiers YAML for preservation
  (result as any)._classifiersYaml = classifiersYaml.join('\n');

  return result;
}

/**
 * Serialize panes config back to YAML
 */
function stringifyYaml(config: PanesConfig): string {
  const lines: string[] = [];

  // Preserve original classifiers section
  const classifiersYaml = (config as any)._classifiersYaml;
  if (classifiersYaml) {
    lines.push(classifiersYaml);
  } else {
    lines.push('classifiers:');
    lines.push('  tell: []');
    lines.push('  say: []');
    lines.push('  channel: []');
    lines.push('  channelContent: []');
  }

  lines.push('');
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
    if (pane.filter.types && pane.filter.types.length > 0) {
      lines.push(`      types: [${pane.filter.types.join(', ')}]`);
    }
    if (pane.filter.channels && pane.filter.channels.length > 0) {
      lines.push(`      channels: [${pane.filter.channels.join(', ')}]`);
    }
    if (pane.filter.excludeChannels && pane.filter.excludeChannels.length > 0) {
      lines.push(`      excludeChannels: [${pane.filter.excludeChannels.join(', ')}]`);
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
