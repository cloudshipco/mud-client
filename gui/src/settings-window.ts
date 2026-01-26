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
import {
  AppConfig,
  DEFAULT_CONFIG,
  CONFIG_OPTIONS,
  CONFIG_DESCRIPTIONS,
  loadConfig,
  saveConfig,
  resetConfig,
} from './services/config-store';
import {
  PanesConfig,
  PaneConfig,
  loadPanesConfig,
  savePanesConfig,
  updatePane,
} from './services/panes-config-store';
import {
  AliasMap,
  loadAliases,
  saveAliases,
  resetAliases,
} from './services/aliases-config-store';

type TabId = 'terminal' | 'config' | 'panes' | 'aliases';

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
let currentConfig: AppConfig;
let originalConfig: AppConfig;
let currentPanesConfig: PanesConfig | null = null;
let originalPanesConfig: PanesConfig | null = null;
let currentAliases: AliasMap = {};
let originalAliases: AliasMap = {};
let activeTab: TabId = 'terminal';

async function init() {
  [currentSettings, currentConfig, currentPanesConfig, currentAliases] = await Promise.all([
    loadSettings(),
    loadConfig(),
    loadPanesConfig(),
    loadAliases(),
  ]);
  originalSettings = JSON.parse(JSON.stringify(currentSettings));
  originalConfig = JSON.parse(JSON.stringify(currentConfig));
  originalPanesConfig = currentPanesConfig ? JSON.parse(JSON.stringify(currentPanesConfig)) : null;
  originalAliases = JSON.parse(JSON.stringify(currentAliases));
  render();
}

function render() {
  const root = document.getElementById('settings-root');
  if (!root) return;

  root.innerHTML = `
    <div class="settings-container">
      <div class="settings-tabs">
        <button class="settings-tab ${activeTab === 'terminal' ? 'active' : ''}" data-tab="terminal">Terminal</button>
        <button class="settings-tab ${activeTab === 'config' ? 'active' : ''}" data-tab="config">Config</button>
        <button class="settings-tab ${activeTab === 'panes' ? 'active' : ''}" data-tab="panes">Panes</button>
        <button class="settings-tab ${activeTab === 'aliases' ? 'active' : ''}" data-tab="aliases">Aliases</button>
      </div>
      <div class="settings-content">
        ${activeTab === 'terminal' ? buildTerminalSections() : activeTab === 'config' ? buildConfigSection() : activeTab === 'panes' ? buildPanesSection() : buildAliasesSection()}
      </div>
      <div class="settings-footer">
        <button class="settings-btn settings-btn-danger" id="reset-btn">Reset to Defaults</button>
        <button class="settings-btn settings-btn-secondary" id="cancel-btn">Cancel</button>
        <button class="settings-btn settings-btn-primary" id="apply-btn">Apply</button>
      </div>
    </div>
  `;

  bindTabs();
  bindInputs();
  bindButtons();
}

function buildTerminalSections(): string {
  return `
    ${buildFontSection()}
    ${buildCursorSection()}
    ${buildColorsSection()}
  `;
}

function buildConfigSection(): string {
  const c = currentConfig;
  return `
    <div class="settings-section">
      <h3>Display</h3>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="status-position">Status Position</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.statusPosition}</span>
        </div>
        <select class="settings-select" id="status-position" data-config="statusPosition">
          ${CONFIG_OPTIONS.statusPosition.map(
            (o) => `<option value="${o.value}" ${c.statusPosition === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="timestamps">Timestamps</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.timestamps}</span>
        </div>
        <select class="settings-select" id="timestamps" data-config="timestamps">
          ${CONFIG_OPTIONS.timestamps.map(
            (o) => `<option value="${o.value}" ${c.timestamps === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="word-wrap">Word Wrap</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.wordWrap}</span>
        </div>
        <input type="checkbox" class="settings-checkbox" id="word-wrap" data-config="wordWrap"
               ${c.wordWrap ? 'checked' : ''}>
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="echo-commands">Echo Commands</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.echoCommands}</span>
        </div>
        <input type="checkbox" class="settings-checkbox" id="echo-commands" data-config="echoCommands"
               ${c.echoCommands ? 'checked' : ''}>
      </div>
    </div>

    <div class="settings-section">
      <h3>Input</h3>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="input-mode">After Sending</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.inputMode}</span>
        </div>
        <select class="settings-select" id="input-mode" data-config="inputMode">
          ${CONFIG_OPTIONS.inputMode.map(
            (o) => `<option value="${o.value}" ${c.inputMode === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="command-separator">Command Separator</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.commandSeparator}</span>
        </div>
        <input type="text" class="settings-input settings-input-text" id="command-separator" data-config="commandSeparator"
               value="${escapeHtml(c.commandSeparator)}" placeholder=";;">
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="movement-keys">Movement Keys</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.movementKeys}</span>
        </div>
        <input type="checkbox" class="settings-checkbox" id="movement-keys" data-config="movementKeys"
               ${c.movementKeys ? 'checked' : ''}>
      </div>
    </div>

    <div class="settings-section">
      <h3>Connection</h3>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="auto-reconnect">Auto Reconnect</label>
          <span class="settings-description">${CONFIG_DESCRIPTIONS.autoReconnect}</span>
        </div>
        <input type="checkbox" class="settings-checkbox" id="auto-reconnect" data-config="autoReconnect"
               ${c.autoReconnect ? 'checked' : ''}>
      </div>
    </div>

    <div class="settings-note">
      Changes require restarting the client to take effect.
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPanesSection(): string {
  if (!currentPanesConfig || currentPanesConfig.panes.length === 0) {
    return `
      <div class="settings-section">
        <h3>Panes</h3>
        <div class="settings-empty">
          <p>No panes configured.</p>
          <p class="settings-description">
            Create <code>~/.config/mud-client/panes.yaml</code> to define panes
            for capturing tells, channels, and other message types.
          </p>
        </div>
      </div>
    `;
  }

  const paneRows = currentPanesConfig.panes.map((pane) => {
    const filterDesc = formatPaneFilter(pane);
    return `
      <div class="settings-pane-card" data-pane-id="${pane.id}">
        <div class="settings-pane-header">
          <div class="settings-pane-title">
            <input type="checkbox" class="settings-checkbox" data-pane-enabled="${pane.id}"
                   ${pane.enabled !== false ? 'checked' : ''}>
            <span class="settings-pane-name">${escapeHtml(pane.id)}</span>
          </div>
          <span class="settings-pane-filter">${filterDesc}</span>
        </div>
        <div class="settings-pane-options">
          <div class="settings-pane-option">
            <label class="settings-label">Height (lines)</label>
            <input type="number" class="settings-input" data-pane-height="${pane.id}"
                   value="${pane.height}" min="1" max="20" step="1">
          </div>
          <div class="settings-pane-option">
            <label class="settings-label">Passthrough</label>
            <input type="checkbox" class="settings-checkbox" data-pane-passthrough="${pane.id}"
                   ${pane.passthrough ? 'checked' : ''}>
          </div>
          <div class="settings-pane-option">
            <label class="settings-label">Max Messages</label>
            <input type="number" class="settings-input" data-pane-max="${pane.id}"
                   value="${pane.maxMessages || 500}" min="50" max="2000" step="50">
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section">
      <h3>Panes</h3>
      <div class="settings-panes-list">
        ${paneRows}
      </div>
    </div>
    <div class="settings-note">
      Changes require restarting the client to take effect.
      Edit <code>~/.config/mud-client/panes.yaml</code> for advanced configuration.
    </div>
  `;
}

function formatPaneFilter(pane: PaneConfig): string {
  const parts: string[] = [];
  if (pane.filter.types && pane.filter.types.length > 0) {
    parts.push(pane.filter.types.join(', '));
  }
  if (pane.filter.channels && pane.filter.channels.length > 0) {
    parts.push(`channels: ${pane.filter.channels.join(', ')}`);
  }
  if (pane.filter.pattern) {
    parts.push(`pattern`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'all messages';
}

function buildAliasesSection(): string {
  const aliasEntries = Object.entries(currentAliases).sort((a, b) => a[0].localeCompare(b[0]));

  const aliasRows = aliasEntries.map(([name, expansion]) => `
    <div class="settings-alias-row" data-alias-name="${escapeHtml(name)}">
      <input type="text" class="settings-input settings-alias-name" data-alias-key="${escapeHtml(name)}"
             value="${escapeHtml(name)}" placeholder="Alias name">
      <input type="text" class="settings-input settings-alias-expansion" data-alias-value="${escapeHtml(name)}"
             value="${escapeHtml(expansion)}" placeholder="Expansion">
      <button class="settings-btn settings-btn-icon" data-alias-delete="${escapeHtml(name)}" title="Delete alias">×</button>
    </div>
  `).join('');

  return `
    <div class="settings-section">
      <h3>Aliases</h3>
      <p class="settings-description">
        Define shortcuts that expand into longer commands. For example, alias "k" could expand to "kill goblin".
      </p>
      <div class="settings-aliases-list">
        ${aliasRows || '<div class="settings-empty"><p>No aliases defined.</p></div>'}
      </div>
      <div class="settings-alias-add">
        <input type="text" class="settings-input settings-alias-name" id="new-alias-name" placeholder="New alias">
        <input type="text" class="settings-input settings-alias-expansion" id="new-alias-expansion" placeholder="Expansion">
        <button class="settings-btn settings-btn-secondary" id="add-alias-btn">Add</button>
      </div>
    </div>
    <div class="settings-note">
      Changes require restarting the client to take effect.
    </div>
  `;
}

function bindTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = (tab as HTMLElement).dataset.tab as TabId;
      render();
    });
  });
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
  // Generic settings inputs (terminal tab)
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

  // Config inputs (config tab)
  const configInputs = document.querySelectorAll('[data-config]');
  configInputs.forEach((input) => {
    const el = input as HTMLInputElement | HTMLSelectElement;
    const configKey = el.dataset.config as keyof AppConfig;

    const handler = () => {
      updateConfig(configKey, el);
    };

    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // Pane inputs (panes tab)
  bindPaneInputs();

  // Alias inputs (aliases tab)
  bindAliasInputs();
}

function bindPaneInputs() {
  if (!currentPanesConfig) return;

  // Enabled checkboxes
  document.querySelectorAll('[data-pane-enabled]').forEach((input) => {
    const el = input as HTMLInputElement;
    const paneId = el.dataset.paneEnabled!;
    el.addEventListener('change', () => {
      currentPanesConfig = updatePane(currentPanesConfig!, paneId, { enabled: el.checked });
    });
  });

  // Height inputs
  document.querySelectorAll('[data-pane-height]').forEach((input) => {
    const el = input as HTMLInputElement;
    const paneId = el.dataset.paneHeight!;
    el.addEventListener('change', () => {
      const height = parseInt(el.value, 10);
      if (!isNaN(height) && height >= 1) {
        currentPanesConfig = updatePane(currentPanesConfig!, paneId, { height });
      }
    });
  });

  // Passthrough checkboxes
  document.querySelectorAll('[data-pane-passthrough]').forEach((input) => {
    const el = input as HTMLInputElement;
    const paneId = el.dataset.panePassthrough!;
    el.addEventListener('change', () => {
      currentPanesConfig = updatePane(currentPanesConfig!, paneId, { passthrough: el.checked });
    });
  });

  // Max messages inputs
  document.querySelectorAll('[data-pane-max]').forEach((input) => {
    const el = input as HTMLInputElement;
    const paneId = el.dataset.paneMax!;
    el.addEventListener('change', () => {
      const maxMessages = parseInt(el.value, 10);
      if (!isNaN(maxMessages) && maxMessages >= 50) {
        currentPanesConfig = updatePane(currentPanesConfig!, paneId, { maxMessages });
      }
    });
  });
}

function bindAliasInputs() {
  // Edit alias name (rename)
  document.querySelectorAll('[data-alias-key]').forEach((input) => {
    const el = input as HTMLInputElement;
    const originalName = el.dataset.aliasKey!;
    el.addEventListener('change', () => {
      const newName = el.value.trim();
      if (newName && newName !== originalName && !currentAliases[newName]) {
        const expansion = currentAliases[originalName];
        delete currentAliases[originalName];
        currentAliases[newName] = expansion;
        render();
      } else if (!newName || newName === originalName) {
        el.value = originalName;
      } else {
        // Name already exists
        el.value = originalName;
      }
    });
  });

  // Edit alias expansion
  document.querySelectorAll('[data-alias-value]').forEach((input) => {
    const el = input as HTMLInputElement;
    const name = el.dataset.aliasValue!;
    el.addEventListener('change', () => {
      if (el.value.trim()) {
        currentAliases[name] = el.value;
      }
    });
  });

  // Delete alias
  document.querySelectorAll('[data-alias-delete]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const name = el.dataset.aliasDelete!;
    el.addEventListener('click', () => {
      delete currentAliases[name];
      render();
    });
  });

  // Add new alias
  document.getElementById('add-alias-btn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('new-alias-name') as HTMLInputElement;
    const expansionInput = document.getElementById('new-alias-expansion') as HTMLInputElement;

    const name = nameInput?.value.trim();
    const expansion = expansionInput?.value.trim();

    if (name && expansion && !currentAliases[name]) {
      currentAliases[name] = expansion;
      render();
    }
  });
}

function updateConfig(
  key: keyof AppConfig,
  el: HTMLInputElement | HTMLSelectElement
): void {
  switch (key) {
    case 'echoCommands':
    case 'autoReconnect':
    case 'movementKeys':
    case 'wordWrap':
      if (el instanceof HTMLInputElement) {
        currentConfig[key] = el.checked;
      }
      break;
    case 'statusPosition':
      currentConfig.statusPosition = el.value as AppConfig['statusPosition'];
      break;
    case 'timestamps':
      currentConfig.timestamps = el.value as AppConfig['timestamps'];
      break;
    case 'inputMode':
      currentConfig.inputMode = el.value as AppConfig['inputMode'];
      break;
    case 'commandSeparator':
      currentConfig.commandSeparator = el.value;
      break;
  }
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
    const saves: Promise<void>[] = [
      saveSettings(currentSettings),
      saveConfig(currentConfig),
      saveAliases(currentAliases),
    ];
    if (currentPanesConfig) {
      saves.push(savePanesConfig(currentPanesConfig));
    }
    await Promise.all(saves);
    emitSettingsChange();
    getCurrentWindow().close();
  });

  document.getElementById('cancel-btn')?.addEventListener('click', async () => {
    // Revert to original settings
    await emit('settings-changed', originalSettings);
    getCurrentWindow().close();
  });

  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    if (activeTab === 'terminal') {
      currentSettings = await resetSettings();
      emitSettingsChange();
    } else if (activeTab === 'config') {
      currentConfig = await resetConfig();
    } else if (activeTab === 'aliases') {
      currentAliases = await resetAliases();
    }
    // Note: No reset for panes - they need the YAML file
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
