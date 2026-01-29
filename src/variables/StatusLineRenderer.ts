/**
 * Renders status line gauges for the terminal.
 * Uses ASCII block characters for visual health/mana/etc bars.
 */

import type { GaugeConfig, GaugeColors } from "./types";
import type { VariableStore } from "./VariableStore";

// Default colors: green > 66%, yellow 33-66%, red < 33%
const DEFAULT_COLORS: GaugeColors = {
  high: "\x1b[32m",   // Green
  mid: "\x1b[33m",    // Yellow
  low: "\x1b[31m",    // Red
};

// Block characters for gauge rendering
const FULL_BLOCK = "█";    // U+2588
const EMPTY_BLOCK = "░";   // U+2591

const RESET = "\x1b[0m";
const DIM = "\x1b[90m";

/**
 * Convert hex color to ANSI 24-bit color escape code
 */
function hexToAnsi(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, "");
  if (cleanHex.length !== 6) return DEFAULT_COLORS.high; // Fallback

  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return DEFAULT_COLORS.high;

  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Render a single gauge bar
 *
 * Example output: "HP:[████████░░] 80/100"
 */
export function renderGauge(
  config: GaugeConfig,
  variables: VariableStore,
): string {
  const width = config.width ?? 10;
  const colors = config.colors ?? DEFAULT_COLORS;

  // Get current value
  const currentValue = variables.getValue(config.variable);
  if (currentValue === undefined) {
    // Variable not set - show empty gauge
    return `${DIM}${config.label}:[${EMPTY_BLOCK.repeat(width)}] --${RESET}`;
  }

  const current = typeof currentValue === "number" ? currentValue : parseFloat(String(currentValue)) || 0;

  // Get max value
  let max: number;
  if (config.maxVariable) {
    const maxValue = variables.getValue(config.maxVariable);
    max = typeof maxValue === "number" ? maxValue : parseFloat(String(maxValue)) || 100;
  } else {
    max = config.max ?? 100;
  }

  // Calculate percentage and filled blocks
  const percent = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  const filledBlocks = Math.round(percent * width);
  const emptyBlocks = width - filledBlocks;

  // Determine color: use custom color if set, otherwise threshold-based
  let color: string;
  if (config.color) {
    // Custom color (hex) - convert to ANSI
    color = hexToAnsi(config.color);
  } else if (percent > 0.66) {
    color = colors.high;
  } else if (percent > 0.33) {
    color = colors.mid;
  } else {
    color = colors.low;
  }

  // Build the gauge string
  const bar = color + FULL_BLOCK.repeat(filledBlocks) + DIM + EMPTY_BLOCK.repeat(emptyBlocks) + RESET;
  const valueDisplay = config.maxVariable || config.max
    ? `${Math.floor(current)}/${Math.floor(max)}`
    : `${Math.floor(current)}`;

  return `${DIM}${config.label}:${RESET}[${bar}]${DIM}${valueDisplay}${RESET}`;
}

/**
 * Render the complete status line with all gauges
 *
 * @param gauges Array of gauge configurations
 * @param variables The variable store
 * @param maxWidth Maximum terminal width
 * @returns The formatted status line string
 */
export function renderStatusLine(
  gauges: GaugeConfig[],
  variables: VariableStore,
  maxWidth: number,
): string {
  if (gauges.length === 0) {
    return "";
  }

  const parts: string[] = [];
  for (const gauge of gauges) {
    parts.push(renderGauge(gauge, variables));
  }

  const line = parts.join("  ");

  // Truncate if too long (though this shouldn't be common)
  // Note: This simple truncation doesn't account for ANSI codes
  // For proper truncation we'd need to calculate visible width
  return line;
}

/**
 * Calculate the visible width of a string (excluding ANSI escape codes)
 */
export function visibleWidth(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Check if any gauges have values that need to be displayed
 */
export function hasGaugeData(gauges: GaugeConfig[], variables: VariableStore): boolean {
  return gauges.some(gauge => variables.has(gauge.variable));
}
