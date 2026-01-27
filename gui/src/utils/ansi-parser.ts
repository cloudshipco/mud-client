/**
 * ANSI to HTML converter
 * Parses ANSI escape codes and converts them to styled HTML spans
 * Uses CSS custom properties for colors so they can be changed dynamically
 */

import { TerminalTheme } from "../types/settings";

/**
 * Apply theme colors as CSS custom properties on the document root.
 * This allows instant color updates without re-rendering content.
 */
export function applyThemeColors(theme: TerminalTheme): void {
  const root = document.documentElement;

  // Set CSS custom properties for ANSI colors (0-15)
  root.style.setProperty("--ansi-0", theme.black);
  root.style.setProperty("--ansi-1", theme.red);
  root.style.setProperty("--ansi-2", theme.green);
  root.style.setProperty("--ansi-3", theme.yellow);
  root.style.setProperty("--ansi-4", theme.blue);
  root.style.setProperty("--ansi-5", theme.magenta);
  root.style.setProperty("--ansi-6", theme.cyan);
  root.style.setProperty("--ansi-7", theme.white);
  root.style.setProperty("--ansi-8", theme.brightBlack);
  root.style.setProperty("--ansi-9", theme.brightRed);
  root.style.setProperty("--ansi-10", theme.brightGreen);
  root.style.setProperty("--ansi-11", theme.brightYellow);
  root.style.setProperty("--ansi-12", theme.brightBlue);
  root.style.setProperty("--ansi-13", theme.brightMagenta);
  root.style.setProperty("--ansi-14", theme.brightCyan);
  root.style.setProperty("--ansi-15", theme.brightWhite);

  // Also set foreground/background for default text
  root.style.setProperty("--theme-fg", theme.foreground);
  root.style.setProperty("--theme-bg", theme.background);
}

// Generate 216 color cube (16-231)
function colorCube(index: number): string {
  const i = index - 16;
  const r = Math.floor(i / 36);
  const g = Math.floor((i % 36) / 6);
  const b = i % 6;
  const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40);
  return `#${toHex(r).toString(16).padStart(2, "0")}${toHex(g).toString(16).padStart(2, "0")}${toHex(b).toString(16).padStart(2, "0")}`;
}

// Generate grayscale (232-255)
function grayscale(index: number): string {
  const gray = 8 + (index - 232) * 10;
  return `#${gray.toString(16).padStart(2, "0")}${gray.toString(16).padStart(2, "0")}${gray.toString(16).padStart(2, "0")}`;
}

// Get color for 256-color palette
// For 0-15, returns CSS variable; for 16-255, returns direct hex
function get256Color(index: number): string {
  if (index < 16) return `var(--ansi-${index})`;
  if (index < 232) return colorCube(index);
  return grayscale(index);
}

export interface AnsiState {
  fg?: string; // CSS color value or var(--ansi-X)
  bg?: string;
  fgIndex?: number; // Original ANSI color index (0-15) if applicable
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  blink?: boolean;
  reverse?: boolean;
  hidden?: boolean;
  strikethrough?: boolean;
}

/**
 * Parse SGR (Select Graphic Rendition) codes and update state
 */
function parseSGR(codes: number[], state: AnsiState): AnsiState {
  let newState = { ...state };
  let i = 0;

  while (i < codes.length) {
    const code = codes[i];

    if (code === 0) {
      // Reset all attributes, but continue processing remaining codes
      // (e.g., \x1b[0;31m means "reset, then set red")
      newState = {};
    } else if (code === 1) {
      newState.bold = true;
    } else if (code === 2) {
      newState.dim = true;
    } else if (code === 3) {
      newState.italic = true;
    } else if (code === 4) {
      newState.underline = true;
    } else if (code === 5 || code === 6) {
      newState.blink = true;
    } else if (code === 7) {
      newState.reverse = true;
    } else if (code === 8) {
      newState.hidden = true;
    } else if (code === 9) {
      newState.strikethrough = true;
    } else if (code === 22) {
      newState.bold = false;
      newState.dim = false;
    } else if (code === 23) {
      newState.italic = false;
    } else if (code === 24) {
      newState.underline = false;
    } else if (code === 25) {
      newState.blink = false;
    } else if (code === 27) {
      newState.reverse = false;
    } else if (code === 28) {
      newState.hidden = false;
    } else if (code === 29) {
      newState.strikethrough = false;
    } else if (code >= 30 && code <= 37) {
      // Standard foreground colors (0-7)
      const colorIndex = code - 30;
      newState.fg = `var(--ansi-${colorIndex})`;
      newState.fgIndex = colorIndex;
    } else if (code === 38) {
      // Extended foreground color
      if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        // 256 color mode
        const colorIndex = codes[i + 2];
        newState.fg = get256Color(colorIndex);
        newState.fgIndex = colorIndex < 16 ? colorIndex : undefined;
        i += 2;
      } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        // True color mode (RGB)
        const r = codes[i + 2];
        const g = codes[i + 3];
        const b = codes[i + 4];
        newState.fg = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        newState.fgIndex = undefined;
        i += 4;
      }
    } else if (code === 39) {
      // Default foreground
      delete newState.fg;
      delete newState.fgIndex;
    } else if (code >= 40 && code <= 47) {
      // Standard background colors (0-7)
      newState.bg = `var(--ansi-${code - 40})`;
    } else if (code === 48) {
      // Extended background color
      if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        // 256 color mode
        newState.bg = get256Color(codes[i + 2]);
        i += 2;
      } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        // True color mode (RGB)
        const r = codes[i + 2];
        const g = codes[i + 3];
        const b = codes[i + 4];
        newState.bg = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        i += 4;
      }
    } else if (code === 49) {
      // Default background
      delete newState.bg;
    } else if (code >= 90 && code <= 97) {
      // Bright foreground colors (8-15)
      const colorIndex = code - 90 + 8;
      newState.fg = `var(--ansi-${colorIndex})`;
      newState.fgIndex = colorIndex;
    } else if (code >= 100 && code <= 107) {
      // Bright background colors (8-15)
      newState.bg = `var(--ansi-${code - 100 + 8})`;
    }

    i++;
  }

  return newState;
}

/**
 * Generate CSS style string from ANSI state
 */
function stateToStyle(state: AnsiState): string {
  const styles: string[] = [];

  if (state.fg) {
    // Bold-as-bright: when bold is set with a standard color (0-7), use bright version (8-15)
    let fgColor = state.fg;
    if (
      state.bold &&
      state.fgIndex !== undefined &&
      state.fgIndex >= 0 &&
      state.fgIndex <= 7
    ) {
      fgColor = `var(--ansi-${state.fgIndex + 8})`;
    }
    styles.push(`color:${fgColor}`);
  }
  if (state.bg) {
    styles.push(`background-color:${state.bg}`);
  }
  if (state.bold) {
    styles.push("font-weight:var(--font-weight-bold, bold)");
  }
  if (state.dim) {
    styles.push("opacity:0.5");
  }
  if (state.italic) {
    styles.push("font-style:italic");
  }
  if (state.underline) {
    styles.push("text-decoration:underline");
  }
  if (state.strikethrough) {
    styles.push("text-decoration:line-through");
  }
  if (state.hidden) {
    styles.push("visibility:hidden");
  }

  return styles.join(";");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert ANSI text to HTML with inline styles using CSS custom properties.
 * Colors will update automatically when CSS variables change.
 *
 * @param text - The text containing ANSI escape codes
 * @param initialState - Optional initial ANSI state (for maintaining state across lines)
 * @returns Object with html output and final state (for chaining)
 */
export function ansiToHtml(
  text: string,
  initialState?: AnsiState
): { html: string; state: AnsiState } {
  // Regex to match ANSI escape sequences (SGR only - ending in 'm')
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let state: AnsiState = initialState ? { ...initialState } : {};
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this escape sequence
    const beforeText = text.slice(lastIndex, match.index);
    if (beforeText) {
      const style = stateToStyle(state);
      if (style) {
        result += `<span style="${style}">${escapeHtml(beforeText)}</span>`;
      } else {
        result += escapeHtml(beforeText);
      }
    }

    // Parse the SGR codes
    const codesStr = match[1];
    const codes = codesStr
      ? codesStr.split(";").map((n) => parseInt(n, 10) || 0)
      : [0];
    state = parseSGR(codes, state);

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last escape sequence
  const remainingText = text.slice(lastIndex);
  if (remainingText) {
    const style = stateToStyle(state);
    if (style) {
      result += `<span style="${style}">${escapeHtml(remainingText)}</span>`;
    } else {
      result += escapeHtml(remainingText);
    }
  }

  return { html: result, state };
}

/**
 * Strip all ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
