/**
 * Gauges config store service for mud-client gauge settings
 * Reads/writes ~/.config/mud-client/gauges.yaml
 */

import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';

export interface GaugeColors {
  high: string;
  mid: string;
  low: string;
}

export interface GaugeConfig {
  variable: string;        // Variable name to display
  maxVariable?: string;    // Variable for max value (optional)
  max?: number;            // Static max value (if no maxVariable)
  label: string;           // Display label (e.g., "HP")
  width?: number;          // Bar width in chars (default: 10)
  color?: string;          // Custom gauge color (hex, e.g., "#4caf50")
  colors?: GaugeColors;    // Color thresholds (legacy)
}

export interface StatusLineConfig {
  enabled: boolean;
  position: 'above-input';
}

export interface GaugesConfig {
  gauges: GaugeConfig[];
  statusLine: StatusLineConfig;
}

const DEFAULT_CONFIG: GaugesConfig = {
  gauges: [],
  statusLine: {
    enabled: true,
    position: 'above-input',
  },
};

async function getConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'gauges.yaml');
}

/**
 * Simple YAML parser for gauges.yaml
 */
function parseYaml(content: string): GaugesConfig {
  const lines = content.split('\n');
  const result: GaugesConfig = {
    gauges: [],
    statusLine: { enabled: true, position: 'above-input' },
  };

  let currentSection: string | null = null;
  let currentGauge: Partial<GaugeConfig> | null = null;
  let currentColors: GaugeColors | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level sections
    if (line.startsWith('gauges:')) {
      currentSection = 'gauges';
      continue;
    }

    if (line.startsWith('statusLine:')) {
      currentSection = 'statusLine';
      continue;
    }

    // Parse gauges section
    if (currentSection === 'gauges') {
      // New gauge entry (starts with "  - variable:")
      if (line.match(/^\s{2}-\s+variable:/)) {
        if (currentGauge && currentGauge.variable) {
          if (currentColors) currentGauge.colors = currentColors;
          result.gauges.push(currentGauge as GaugeConfig);
        }
        currentGauge = {};
        currentColors = null;
        const match = line.match(/variable:\s*["']?([^"'\s]+)["']?/);
        if (match) currentGauge.variable = match[1];
        continue;
      }

      if (!currentGauge) continue;

      // Gauge properties
      if (line.match(/^\s{4}maxVariable:/)) {
        const match = line.match(/maxVariable:\s*["']?([^"'\s]+)["']?/);
        if (match) currentGauge.maxVariable = match[1];
      } else if (line.match(/^\s{4}max:/)) {
        const match = line.match(/max:\s*(\d+(?:\.\d+)?)/);
        if (match) currentGauge.max = parseFloat(match[1]);
      } else if (line.match(/^\s{4}label:/)) {
        const match = line.match(/label:\s*["']?([^"'\n]+?)["']?\s*$/);
        if (match) currentGauge.label = match[1];
      } else if (line.match(/^\s{4}width:/)) {
        const match = line.match(/width:\s*(\d+)/);
        if (match) currentGauge.width = parseInt(match[1], 10);
      } else if (line.match(/^\s{4}color:/)) {
        const match = line.match(/color:\s*["']?([^"'\s]+)["']?/);
        if (match) currentGauge.color = match[1];
      } else if (line.match(/^\s{4}colors:/)) {
        currentColors = { high: '', mid: '', low: '' };
      } else if (line.match(/^\s{6}high:/)) {
        const match = line.match(/high:\s*["']?([^"'\s]+)["']?/);
        if (match && currentColors) currentColors.high = match[1];
      } else if (line.match(/^\s{6}mid:/)) {
        const match = line.match(/mid:\s*["']?([^"'\s]+)["']?/);
        if (match && currentColors) currentColors.mid = match[1];
      } else if (line.match(/^\s{6}low:/)) {
        const match = line.match(/low:\s*["']?([^"'\s]+)["']?/);
        if (match && currentColors) currentColors.low = match[1];
      }
    }

    // Parse statusLine section
    if (currentSection === 'statusLine') {
      if (line.match(/^\s{2}enabled:/)) {
        result.statusLine.enabled = line.includes('true');
      } else if (line.match(/^\s{2}position:/)) {
        // Only 'above-input' is supported for now
        result.statusLine.position = 'above-input';
      }
    }
  }

  // Add last gauge
  if (currentGauge && currentGauge.variable) {
    if (currentColors) currentGauge.colors = currentColors;
    result.gauges.push(currentGauge as GaugeConfig);
  }

  return result;
}

/**
 * Serialize gauges config back to YAML
 */
function stringifyYaml(config: GaugesConfig): string {
  const lines: string[] = [];

  lines.push('gauges:');
  for (const gauge of config.gauges) {
    lines.push(`  - variable: ${gauge.variable}`);
    if (gauge.maxVariable) {
      lines.push(`    maxVariable: ${gauge.maxVariable}`);
    }
    if (gauge.max !== undefined) {
      lines.push(`    max: ${gauge.max}`);
    }
    lines.push(`    label: ${gauge.label}`);
    if (gauge.width !== undefined) {
      lines.push(`    width: ${gauge.width}`);
    }
    if (gauge.color) {
      lines.push(`    color: '${gauge.color}'`);
    }
    if (gauge.colors) {
      lines.push('    colors:');
      lines.push(`      high: ${gauge.colors.high}`);
      lines.push(`      mid: ${gauge.colors.mid}`);
      lines.push(`      low: ${gauge.colors.low}`);
    }
  }

  lines.push('');
  lines.push('statusLine:');
  lines.push(`  enabled: ${config.statusLine.enabled}`);
  lines.push(`  position: ${config.statusLine.position}`);

  return lines.join('\n') + '\n';
}

/**
 * Load gauges config from ~/.config/mud-client/gauges.yaml
 */
export async function loadGaugesConfig(): Promise<GaugesConfig> {
  try {
    const configPath = await getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      return DEFAULT_CONFIG;
    }

    const content = await readTextFile(configPath);
    return parseYaml(content);
  } catch (error) {
    console.warn('Failed to load gauges config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save gauges config to ~/.config/mud-client/gauges.yaml
 */
export async function saveGaugesConfig(config: GaugesConfig): Promise<void> {
  try {
    const configPath = await getConfigPath();
    await writeTextFile(configPath, stringifyYaml(config));
  } catch (error) {
    console.error('Failed to save gauges config:', error);
    throw error;
  }
}

/**
 * Add a new gauge to the config
 */
export function addGauge(config: GaugesConfig, gauge: GaugeConfig): GaugesConfig {
  return {
    ...config,
    gauges: [...config.gauges, gauge],
  };
}

/**
 * Remove a gauge from the config
 */
export function removeGauge(config: GaugesConfig, variable: string): GaugesConfig {
  return {
    ...config,
    gauges: config.gauges.filter(g => g.variable !== variable),
  };
}

/**
 * Update a gauge in the config
 */
export function updateGauge(
  config: GaugesConfig,
  variable: string,
  updates: Partial<GaugeConfig>
): GaugesConfig {
  return {
    ...config,
    gauges: config.gauges.map(g =>
      g.variable === variable ? { ...g, ...updates } : g
    ),
  };
}
