/**
 * Predefined color schemes for the terminal
 */

import type { TerminalTheme } from './settings';

export type ColorSchemeName = 'dark' | 'light' | 'pastel';

export interface ColorScheme {
  id: ColorSchemeName;
  name: string;
  theme: TerminalTheme;
}

/**
 * Dark theme - VS Code Dark style (default)
 */
const darkTheme: TerminalTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#1e1e1e',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

/**
 * Light theme - Easy on the eyes in bright environments
 */
const lightTheme: TerminalTheme = {
  background: '#ffffff',
  foreground: '#383a42',
  cursor: '#383a42',
  cursorAccent: '#ffffff',
  selectionBackground: '#bfceff',
  black: '#383a42',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#4078f2',
  magenta: '#a626a4',
  cyan: '#0184bc',
  white: '#a0a1a7',
  brightBlack: '#4f525e',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
};

/**
 * Pastel theme - Soft, muted colors
 */
const pastelTheme: TerminalTheme = {
  background: '#2d2a3e',
  foreground: '#e0def4',
  cursor: '#e0def4',
  cursorAccent: '#2d2a3e',
  selectionBackground: '#44415a',
  black: '#26233a',
  red: '#eb6f92',
  green: '#9ccfd8',
  yellow: '#f6c177',
  blue: '#7aa2f7',
  magenta: '#c4a7e7',
  cyan: '#9ccfd8',
  white: '#e0def4',
  brightBlack: '#6e6a86',
  brightRed: '#f5a4bc',
  brightGreen: '#b4e1e2',
  brightYellow: '#f9d9a0',
  brightBlue: '#a4c4fa',
  brightMagenta: '#dfc9f0',
  brightCyan: '#b4e1e2',
  brightWhite: '#ffffff',
};

/**
 * All available color schemes
 */
export const COLOR_SCHEMES: Record<ColorSchemeName, ColorScheme> = {
  dark: {
    id: 'dark',
    name: 'Dark',
    theme: darkTheme,
  },
  light: {
    id: 'light',
    name: 'Light',
    theme: lightTheme,
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    theme: pastelTheme,
  },
};

/**
 * Get a color scheme by name, defaulting to dark if not found
 */
export function getColorScheme(name: ColorSchemeName | undefined): ColorScheme {
  return COLOR_SCHEMES[name || 'dark'] || COLOR_SCHEMES.dark;
}

/**
 * List of all available scheme names for UI dropdowns
 */
export const COLOR_SCHEME_OPTIONS: { value: ColorSchemeName; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'pastel', label: 'Pastel' },
];
