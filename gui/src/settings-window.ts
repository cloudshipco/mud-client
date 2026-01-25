/**
 * Settings Window - Runs in the separate settings window
 */

import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  TerminalSettings,
  DEFAULT_SETTINGS,
  CursorStyle,
  FontWeight,
  TerminalTheme,
} from './types/settings';
import { loadSettings, saveSettings, resetSettings } from './services/settings-store';

const FONT_FAMILIES = [
  { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
  { value: '"Fira Code", monospace', label: 'Fira Code' },
  { value: '"SF Mono", monospace', label: 'SF Mono' },
  { value: 'Menlo, monospace', label: 'Menlo' },
  { value: 'Monaco, monospace', label: 'Monaco' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: 'monospace', label: 'System Monospace' },
];

const CURSOR_STYLES: { value: CursorStyle; label: string }[] = [
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
  { value: 'bar', label: 'Bar' },
];

const FONT_WEIGHTS: { value: FontWeight; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Bold' },
  { value: 100, label: '100 (Thin)' },
  { value: 200, label: '200 (Extra Light)' },
  { value: 300, label: '300 (Light)' },
  { value: 400, label: '400 (Regular)' },
  { value: 500, label: '500 (Medium)' },
  { value: 600, label: '600 (Semi Bold)' },
  { value: 700, label: '700 (Bold)' },
  { value: 800, label: '800 (Extra Bold)' },
  { value: 900, label: '900 (Black)' },
];

let currentSettings: TerminalSettings;
let originalSettings: TerminalSettings;

async function init() {
  currentSettings = await loadSettings();
  originalSettings = JSON.parse(JSON.stringify(currentSettings));
  render();
}

function render() {
  const root = document.getElementById('settings-root');
  if (!root) return;

  root.innerHTML = `
    <div class="settings-container">
      ${buildFontSection()}
      ${buildCursorSection()}
      ${buildColorsSection()}
      <div class="settings-footer">
        <button class="settings-btn settings-btn-danger" id="reset-btn">Reset to Defaults</button>
        <button class="settings-btn settings-btn-secondary" id="cancel-btn">Cancel</button>
        <button class="settings-btn settings-btn-primary" id="apply-btn">Apply</button>
      </div>
    </div>
  `;

  bindInputs();
  bindButtons();
}

function buildFontSection(): string {
  const s = currentSettings;
  return `
    <div class="settings-section">
      <h3>Typography</h3>
      <div class="settings-row">
        <label class="settings-label" for="font-family">Font Family</label>
        <select class="settings-select" id="font-family" data-setting="fontFamily">
          ${FONT_FAMILIES.map(
            (f) =>
              `<option value="${f.value}" ${s.fontFamily === f.value ? 'selected' : ''}>${f.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <label class="settings-label" for="font-size">Font Size</label>
        <input type="number" class="settings-input" id="font-size" data-setting="fontSize"
               value="${s.fontSize}" min="8" max="32" step="1">
      </div>
      <div class="settings-row">
        <label class="settings-label" for="font-weight">Font Weight</label>
        <select class="settings-select" id="font-weight" data-setting="fontWeight">
          ${FONT_WEIGHTS.map(
            (w) =>
              `<option value="${w.value}" ${String(s.fontWeight) === String(w.value) ? 'selected' : ''}>${w.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <label class="settings-label" for="font-weight-bold">Bold Font Weight</label>
        <select class="settings-select" id="font-weight-bold" data-setting="fontWeightBold">
          ${FONT_WEIGHTS.map(
            (w) =>
              `<option value="${w.value}" ${String(s.fontWeightBold) === String(w.value) ? 'selected' : ''}>${w.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <label class="settings-label" for="line-height">Line Height</label>
        <input type="number" class="settings-input" id="line-height" data-setting="lineHeight"
               value="${s.lineHeight}" min="0.8" max="2.0" step="0.1">
      </div>
      <div class="settings-row">
        <label class="settings-label" for="letter-spacing">Letter Spacing</label>
        <input type="number" class="settings-input" id="letter-spacing" data-setting="letterSpacing"
               value="${s.letterSpacing}" min="-2" max="4" step="0.5">
      </div>
    </div>
  `;
}

function buildCursorSection(): string {
  const s = currentSettings;
  return `
    <div class="settings-section">
      <h3>Cursor</h3>
      <div class="settings-row">
        <label class="settings-label" for="cursor-style">Cursor Style</label>
        <select class="settings-select" id="cursor-style" data-setting="cursorStyle">
          ${CURSOR_STYLES.map(
            (c) =>
              `<option value="${c.value}" ${s.cursorStyle === c.value ? 'selected' : ''}>${c.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <label class="settings-label" for="cursor-blink">Cursor Blink</label>
        <input type="checkbox" class="settings-checkbox" id="cursor-blink" data-setting="cursorBlink"
               ${s.cursorBlink ? 'checked' : ''}>
      </div>
    </div>
  `;
}

function buildColorsSection(): string {
  const theme = currentSettings.theme;
  const ansiColors: { key: keyof TerminalTheme; label: string }[] = [
    { key: 'black', label: 'Black' },
    { key: 'red', label: 'Red' },
    { key: 'green', label: 'Green' },
    { key: 'yellow', label: 'Yellow' },
    { key: 'blue', label: 'Blue' },
    { key: 'magenta', label: 'Magenta' },
    { key: 'cyan', label: 'Cyan' },
    { key: 'white', label: 'White' },
  ];

  return `
    <div class="settings-section">
      <h3>Colors</h3>

      <div class="settings-color-grid">
        <div class="settings-color-item">
          <input type="color" class="settings-color-swatch" data-theme-color="background" value="${theme.background}" title="Background">
          <span class="settings-color-label">Background</span>
        </div>
        <div class="settings-color-item">
          <input type="color" class="settings-color-swatch" data-theme-color="foreground" value="${theme.foreground}" title="Foreground">
          <span class="settings-color-label">Foreground</span>
        </div>
        <div class="settings-color-item">
          <input type="color" class="settings-color-swatch" data-theme-color="cursor" value="${theme.cursor}" title="Cursor">
          <span class="settings-color-label">Cursor</span>
        </div>
        <div class="settings-color-item">
          <input type="color" class="settings-color-swatch" data-theme-color="cursorAccent" value="${theme.cursorAccent}" title="Cursor Text">
          <span class="settings-color-label">Cursor Text</span>
        </div>
        <div class="settings-color-item">
          <input type="color" class="settings-color-swatch" data-theme-color="selectionBackground" value="${theme.selectionBackground}" title="Selection">
          <span class="settings-color-label">Selection</span>
        </div>
      </div>

      <div class="settings-ansi-colors">
        <div class="settings-ansi-row">
          <span class="settings-ansi-label">Normal</span>
          <div class="settings-ansi-swatches">
            ${ansiColors.map(({ key, label }) => `<input type="color" class="settings-color-swatch" data-theme-color="${key}" value="${theme[key]}" title="${label}">`).join('')}
          </div>
        </div>
        <div class="settings-ansi-row">
          <span class="settings-ansi-label">Bright</span>
          <div class="settings-ansi-swatches">
            ${ansiColors.map(({ key, label }) => {
              const brightKey = ('bright' + key.charAt(0).toUpperCase() + key.slice(1)) as keyof TerminalTheme;
              return `<input type="color" class="settings-color-swatch" data-theme-color="${brightKey}" value="${theme[brightKey]}" title="Bright ${label}">`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindInputs() {
  // Generic settings inputs
  const inputs = document.querySelectorAll('[data-setting]');
  inputs.forEach((input) => {
    const el = input as HTMLInputElement | HTMLSelectElement;
    const setting = el.dataset.setting as keyof TerminalSettings;

    const handler = () => {
      updateSetting(setting, el);
      emitSettingsChange();
    };

    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // Color swatch inputs
  const colorSwatches = document.querySelectorAll('[data-theme-color]');
  colorSwatches.forEach((input) => {
    const el = input as HTMLInputElement;
    const colorKey = el.dataset.themeColor as keyof TerminalTheme;

    el.addEventListener('input', () => {
      currentSettings.theme[colorKey] = el.value;
      emitSettingsChange();
    });
  });
}

function updateSetting(
  setting: keyof TerminalSettings,
  el: HTMLInputElement | HTMLSelectElement
): void {
  switch (setting) {
    case 'cursorBlink':
      if (el instanceof HTMLInputElement) {
        currentSettings.cursorBlink = el.checked;
      }
      break;
    case 'fontSize':
    case 'lineHeight':
    case 'letterSpacing': {
      const value = parseFloat(el.value);
      if (!isNaN(value)) {
        currentSettings[setting] = value;
      }
      break;
    }
    case 'fontWeight':
    case 'fontWeightBold': {
      const numValue = parseInt(el.value, 10);
      const weight: FontWeight = isNaN(numValue)
        ? (el.value as 'normal' | 'bold')
        : (numValue as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900);
      currentSettings[setting] = weight;
      break;
    }
    case 'fontFamily':
      currentSettings.fontFamily = el.value;
      break;
    case 'cursorStyle':
      currentSettings.cursorStyle = el.value as CursorStyle;
      break;
  }
}

function bindButtons() {
  document.getElementById('apply-btn')?.addEventListener('click', async () => {
    await saveSettings(currentSettings);
    emitSettingsChange();
    getCurrentWindow().close();
  });

  document.getElementById('cancel-btn')?.addEventListener('click', async () => {
    // Revert to original settings
    await emit('settings-changed', originalSettings);
    getCurrentWindow().close();
  });

  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    currentSettings = await resetSettings();
    emitSettingsChange();
    render();
  });
}

function emitSettingsChange() {
  emit('settings-changed', currentSettings);
}

// Handle Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    emit('settings-changed', originalSettings);
    getCurrentWindow().close();
  }
});

init();
