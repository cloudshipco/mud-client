/**
 * Settings store service using Tauri plugin-store
 */

import { LazyStore } from '@tauri-apps/plugin-store';
import { TerminalSettings, DEFAULT_SETTINGS } from '../types/settings';

const SETTINGS_KEY = 'terminal';
const store = new LazyStore('settings.json');

/**
 * Valid font family values that can be selected in settings
 */
const VALID_FONT_FAMILIES = [
  'MonaspaceNeon, monospace',
  'MonaspaceArgon, monospace',
  'MonaspaceXenon, monospace',
  'MonaspaceRadon, monospace',
  'MonaspaceKrypton, monospace',
  '"JetBrains Mono", monospace',
  '"Fira Code", monospace',
  '"SF Mono", monospace',
  'Menlo, monospace',
  'Monaco, monospace',
  '"Courier New", monospace',
  'monospace',
];

/**
 * Deep merge settings with defaults, ensuring all required fields exist
 */
function mergeSettings(
  defaults: TerminalSettings,
  saved: Partial<TerminalSettings>
): TerminalSettings {
  // Validate fontFamily - use default if saved value is invalid or empty
  let fontFamily = saved.fontFamily;
  if (!fontFamily || !VALID_FONT_FAMILIES.includes(fontFamily)) {
    fontFamily = defaults.fontFamily;
  }

  return {
    fontFamily,
    fontSize: saved.fontSize ?? defaults.fontSize,
    fontWeight: saved.fontWeight ?? defaults.fontWeight,
    fontWeightBold: saved.fontWeightBold ?? defaults.fontWeightBold,
    lineHeight: saved.lineHeight ?? defaults.lineHeight,
    letterSpacing: saved.letterSpacing ?? defaults.letterSpacing,
    cursorStyle: saved.cursorStyle ?? defaults.cursorStyle,
    cursorBlink: saved.cursorBlink ?? defaults.cursorBlink,
    theme: {
      ...defaults.theme,
      ...(saved.theme ?? {}),
    },
  };
}

/**
 * Load settings from store, merging with defaults for any missing values
 */
export async function loadSettings(): Promise<TerminalSettings> {
  try {
    const saved = await store.get<Partial<TerminalSettings>>(SETTINGS_KEY);
    if (saved) {
      return mergeSettings(DEFAULT_SETTINGS, saved);
    }
  } catch (error) {
    console.warn('Failed to load settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to store
 */
export async function saveSettings(settings: TerminalSettings): Promise<void> {
  try {
    await store.set(SETTINGS_KEY, settings);
    await store.save();
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<TerminalSettings> {
  const defaults = { ...DEFAULT_SETTINGS };
  await saveSettings(defaults);
  return defaults;
}
