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
import {
  PatternsConfig,
  loadPatternsConfig,
  savePatternsConfig,
  resetPatternsConfig,
  validateRegex,
} from './services/patterns-config-store';
import {
  updatePanePatterns,
} from './services/panes-config-store';
import {
  NotificationsConfig,
  loadNotificationsConfig,
  saveNotificationsConfig,
  resetNotificationsConfig,
} from './services/notifications-config-store';
import {
  TriggersConfig,
  TriggerDefinition,
  TriggerCondition,
  TriggerAction,
  CONDITION_OPERATORS,
  ACTION_TYPES,
  loadTriggersConfig,
  saveTriggersConfig,
  resetTriggersConfig,
} from './services/triggers-config-store';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

type TabId = 'terminal' | 'config' | 'panes' | 'aliases' | 'patterns' | 'notifications' | 'triggers';

const FONT_FAMILIES = [
  // Bundled fonts (Monaspace)
  { value: 'MonaspaceNeon, monospace', label: 'Monaspace Neon' },
  { value: 'MonaspaceArgon, monospace', label: 'Monaspace Argon' },
  { value: 'MonaspaceXenon, monospace', label: 'Monaspace Xenon' },
  { value: 'MonaspaceRadon, monospace', label: 'Monaspace Radon' },
  { value: 'MonaspaceKrypton, monospace', label: 'Monaspace Krypton' },
  // System fonts
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

/**
 * Extract named capture group names from a regex pattern.
 * Named capture groups use the syntax (?<name>...).
 */
function extractCaptureGroups(pattern: string): string[] {
  const groups: string[] = [];
  const regex = /\(\?<(\w+)>/g;
  let match;
  while ((match = regex.exec(pattern)) !== null) {
    groups.push(match[1]);
  }
  return groups;
}

/**
 * Get all unique capture group names from selected pattern groups.
 */
function getCaptureGroupsForPatternGroups(patternGroups: string[]): string[] {
  const captureGroups = new Set<string>();
  for (const groupName of patternGroups) {
    const patterns = currentPatterns.groups[groupName] || [];
    for (const pattern of patterns) {
      for (const capture of extractCaptureGroups(pattern)) {
        captureGroups.add(capture);
      }
    }
  }
  return Array.from(captureGroups).sort();
}

let currentSettings: TerminalSettings;
let originalSettings: TerminalSettings;
let currentConfig: AppConfig;
let originalConfig: AppConfig;
let currentPanesConfig: PanesConfig | null = null;
let originalPanesConfig: PanesConfig | null = null;
let currentAliases: AliasMap = {};
let originalAliases: AliasMap = {};
let currentPatterns: PatternsConfig = { groups: {} };
let originalPatterns: PatternsConfig = { groups: {} };
let currentNotifications: NotificationsConfig = { enabled: true, groups: [] };
let originalNotifications: NotificationsConfig = { enabled: true, groups: [] };
let currentTriggers: TriggersConfig = { triggers: [] };
let originalTriggers: TriggersConfig = { triggers: [] };
let activeTab: TabId = 'terminal';

async function init() {
  [currentSettings, currentConfig, currentPanesConfig, currentAliases, currentPatterns, currentNotifications, currentTriggers] = await Promise.all([
    loadSettings(),
    loadConfig(),
    loadPanesConfig(),
    loadAliases(),
    loadPatternsConfig(),
    loadNotificationsConfig(),
    loadTriggersConfig(),
  ]);
  originalSettings = JSON.parse(JSON.stringify(currentSettings));
  originalConfig = JSON.parse(JSON.stringify(currentConfig));
  originalPanesConfig = currentPanesConfig ? JSON.parse(JSON.stringify(currentPanesConfig)) : null;
  originalAliases = JSON.parse(JSON.stringify(currentAliases));
  originalPatterns = JSON.parse(JSON.stringify(currentPatterns));
  originalNotifications = JSON.parse(JSON.stringify(currentNotifications));
  originalTriggers = JSON.parse(JSON.stringify(currentTriggers));
  render();
}

function buildTabContent(): string {
  switch (activeTab) {
    case 'terminal': return buildTerminalSections();
    case 'config': return buildConfigSection();
    case 'panes': return buildPanesSection();
    case 'aliases': return buildAliasesSection();
    case 'patterns': return buildPatternsSection();
    case 'notifications': return buildNotificationsSection();
    case 'triggers': return buildTriggersSection();
    default: return '';
  }
}

function render() {
  const root = document.getElementById('settings-root');
  if (!root) return;

  root.innerHTML = `
    <div class="settings-container">
      <div class="settings-tabs">
        <button class="settings-tab ${activeTab === 'terminal' ? 'active' : ''}" data-tab="terminal">Terminal</button>
        <button class="settings-tab ${activeTab === 'config' ? 'active' : ''}" data-tab="config">Config</button>
        <button class="settings-tab ${activeTab === 'aliases' ? 'active' : ''}" data-tab="aliases">Aliases</button>
        <button class="settings-tab ${activeTab === 'patterns' ? 'active' : ''}" data-tab="patterns">Patterns</button>
        <button class="settings-tab ${activeTab === 'panes' ? 'active' : ''}" data-tab="panes">Panes</button>
        <button class="settings-tab ${activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">Notifications</button>
        <button class="settings-tab ${activeTab === 'triggers' ? 'active' : ''}" data-tab="triggers">Triggers</button>
      </div>
      <div class="settings-content">
        ${buildTabContent()}
      </div>
      <div class="settings-footer">
        ${activeTab === 'terminal' ? '<button class="settings-btn settings-btn-danger" id="reset-btn">Reset to Defaults</button>' : ''}
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

  // Get available pattern groups
  const availableGroups = Object.keys(currentPatterns.groups).sort();

  const paneRows = currentPanesConfig.panes.map((pane) => {
    const currentPanePatterns = pane.filter.patterns || [];
    return `
      <div class="settings-pane-card" data-pane-id="${pane.id}">
        <div class="settings-pane-header">
          <div class="settings-pane-title">
            <input type="checkbox" class="settings-checkbox" data-pane-enabled="${pane.id}"
                   ${pane.enabled !== false ? 'checked' : ''}>
            <span class="settings-pane-name">${escapeHtml(pane.id)}</span>
          </div>
        </div>
        <div class="settings-pane-options">
          <div class="settings-pane-option">
            <label class="settings-label">Float</label>
            <input type="checkbox" class="settings-checkbox" data-pane-floating="${pane.id}"
                   ${pane.position === 'floating' ? 'checked' : ''}>
          </div>
          <div class="settings-pane-option" ${pane.position === 'floating' ? 'style="opacity: 0.4; pointer-events: none;"' : ''}>
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
        <div class="settings-pane-patterns">
          <label class="settings-label">Pattern Groups</label>
          <div class="settings-pane-pattern-chips">
            ${availableGroups.length > 0 ? availableGroups.map(group => `
              <label class="settings-chip ${currentPanePatterns.includes(group) ? 'active' : ''}">
                <input type="checkbox" data-pane-pattern="${pane.id}:${group}"
                       ${currentPanePatterns.includes(group) ? 'checked' : ''}>
                ${escapeHtml(group)}
              </label>
            `).join('') : '<span class="settings-description">No pattern groups defined. Create them in the Patterns tab.</span>'}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section">
      <h3>Panes</h3>
      <p class="settings-description">
        Select which pattern groups each pane should capture. Messages matching selected groups will appear in the pane.
      </p>
      <div class="settings-panes-list">
        ${paneRows}
      </div>
    </div>
    <div class="settings-note">
      Edit <code>~/.config/mud-client/panes.yaml</code> for advanced configuration.
    </div>
  `;
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
  `;
}

function buildPatternsSection(): string {
  const groupNames = Object.keys(currentPatterns.groups).sort();

  const groupSections = groupNames.map(groupName => {
    const patterns = currentPatterns.groups[groupName];
    return `
      <div class="settings-pattern-group-card" data-group-name="${escapeHtml(groupName)}">
        <div class="settings-pattern-group-header">
          <input type="text" class="settings-input settings-group-name-input" data-rename-group="${escapeHtml(groupName)}"
                 value="${escapeHtml(groupName)}" placeholder="Group name">
          <button class="settings-btn settings-btn-icon" data-delete-group="${escapeHtml(groupName)}" title="Delete group">\u00d7</button>
        </div>
        <div class="settings-patterns-list">
          ${buildGroupPatternRows(groupName, patterns)}
        </div>
        <button class="settings-btn settings-btn-secondary settings-pattern-add" data-add-pattern="${escapeHtml(groupName)}">+ Add Pattern</button>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section">
      <h3>Pattern Tester</h3>
      <p class="settings-description">Test which pattern groups match a line of MUD output.</p>
      <div class="settings-pattern-tester">
        <div class="settings-row">
          <input type="text" class="settings-input" id="pattern-test-input"
                 placeholder="Paste MUD output here to test which patterns match...">
          <button class="settings-btn settings-btn-secondary" id="pattern-test-btn">Test</button>
        </div>
        <div id="pattern-test-result" class="settings-pattern-test-result"></div>
      </div>
    </div>

    <div class="settings-section">
      <h3>About Pattern Groups</h3>
      <p class="settings-description">
        Pattern groups use regex to classify MUD output. Messages matching a group's patterns
        are tagged with that group name, which panes and triggers can use.
      </p>
      <details class="settings-help-details">
        <summary>How patterns work</summary>
        <div class="settings-help-content">
          <p>Each pattern is a regular expression that matches against MUD output lines.</p>
          <ul>
            <li><code>^(\\w+) tells you</code> - Matches tell messages</li>
            <li><code>^\\[gossip\\]</code> - Matches gossip channel</li>
            <li><code>^You hit</code> - Matches combat output</li>
          </ul>
          <p>Create groups like "tell", "gossip", "combat" and add patterns to each.</p>
          <p>Use named capture groups like <code>(?&lt;name&gt;...)</code> to extract values for trigger conditions.</p>
        </div>
      </details>
    </div>

    <div class="settings-section">
      <h3>Pattern Groups</h3>
      ${groupSections || '<div class="settings-empty"><p>No pattern groups defined.</p></div>'}
    </div>

    <div class="settings-section">
      <div class="settings-add-group">
        <input type="text" class="settings-input" id="new-group-name" placeholder="New group name">
        <button class="settings-btn settings-btn-secondary" id="add-group-btn">+ Add Group</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Continuation Pattern</h3>
      <p class="settings-description">Lines matching this pattern are treated as continuations of the previous message</p>
      <div class="settings-pattern-row settings-pattern-single">
        <input type="text" class="settings-input settings-pattern-input" id="continuation-pattern"
               value="${escapeHtml(currentPatterns.continuation || '')}" placeholder="^\\s+\\S">
        <span class="settings-pattern-validation" id="continuation-validation"></span>
      </div>
    </div>
  `;
}

function buildGroupPatternRows(groupName: string, patterns: string[]): string {
  if (patterns.length === 0) {
    return '<div class="settings-empty"><p>No patterns in this group.</p></div>';
  }
  return patterns.map((pattern, i) => {
    const validationResult = validateRegex(pattern);
    const isValid = validationResult === null;
    return `
      <div class="settings-pattern-row" data-group="${escapeHtml(groupName)}" data-pattern-index="${i}">
        <div class="settings-pattern-main">
          <input type="text" class="settings-input settings-pattern-input ${isValid ? '' : 'settings-pattern-invalid'}"
                 data-pattern-input="${escapeHtml(groupName)}:${i}" value="${escapeHtml(pattern)}" placeholder="^pattern.*$">
          <span class="settings-pattern-validation ${isValid ? 'valid' : 'invalid'}">${isValid ? '\u2713' : '\u2717'}</span>
          <button class="settings-btn settings-btn-icon" data-delete-pattern="${escapeHtml(groupName)}:${i}" title="Delete pattern">\u00d7</button>
        </div>
      </div>
    `;
  }).join('');
}

function buildNotificationsSection(): string {
  const groupNames = Object.keys(currentPatterns.groups).sort();

  const groupCheckboxes = groupNames.length > 0
    ? groupNames.map(groupName => {
        const isChecked = currentNotifications.groups.includes(groupName);
        return `
          <label class="settings-chip ${isChecked ? 'active' : ''}">
            <input type="checkbox" data-notify-group="${escapeHtml(groupName)}"
                   ${isChecked ? 'checked' : ''}>
            ${escapeHtml(groupName)}
          </label>
        `;
      }).join('')
    : '<span class="settings-description">No pattern groups defined. Create them in the Patterns tab first.</span>';

  return `
    <div class="settings-section">
      <h3>Desktop Notifications</h3>
      <p class="settings-description">
        Receive desktop notifications when messages match selected pattern groups.
        Notifications only appear when the app window is not focused.
      </p>
      <div class="settings-row">
        <label class="settings-label">
          <input type="checkbox" id="notifications-enabled" ${currentNotifications.enabled ? 'checked' : ''}>
          Enable notifications
        </label>
      </div>
      <div class="settings-row" style="margin-top: 12px;">
        <button class="settings-btn settings-btn-secondary" id="test-notification-btn">Send Test Notification</button>
        <span id="notification-status" class="settings-description" style="margin-left: 12px;"></span>
      </div>
    </div>

    <div class="settings-section">
      <h3>Notify for Pattern Groups</h3>
      <div class="settings-pane-pattern-chips">
        ${groupCheckboxes}
      </div>
    </div>
  `;
}

function buildTriggersSection(): string {
  // Get available pattern groups from the Patterns tab
  const availableGroups = Object.keys(currentPatterns.groups).sort();

  const triggerCards = currentTriggers.triggers.map((trigger, triggerIndex) => {
    // Build pattern group selection chips
    const patternChips = availableGroups.map(groupName => {
      const isSelected = trigger.patternGroups.includes(groupName);
      return `
        <label class="settings-chip ${isSelected ? 'active' : ''}">
          <input type="checkbox" data-trigger-pattern-group="${triggerIndex}:${groupName}"
                 ${isSelected ? 'checked' : ''}>
          ${escapeHtml(groupName)}
        </label>
      `;
    }).join('');

    // Get available capture groups from selected pattern groups
    const availableCaptureGroups = getCaptureGroupsForPatternGroups(trigger.patternGroups);

    const conditionRows = (trigger.conditions || []).map((condition, condIndex) => {
      const valueStr = Array.isArray(condition.value)
        ? condition.value.join(', ')
        : String(condition.value ?? '');

      // Build capture group options - include current value if not in list (for backwards compat)
      const captureOptions = [...availableCaptureGroups];
      if (condition.capture && !captureOptions.includes(condition.capture)) {
        captureOptions.unshift(condition.capture);
      }

      return `
        <div class="settings-trigger-condition-row" data-trigger-condition="${triggerIndex}:${condIndex}">
          <select class="settings-select settings-trigger-condition-capture"
                  data-trigger-cond-capture="${triggerIndex}:${condIndex}">
            <option value="">Select capture...</option>
            ${captureOptions.map(cap =>
              `<option value="${escapeHtml(cap)}" ${condition.capture === cap ? 'selected' : ''}>${escapeHtml(cap)}</option>`
            ).join('')}
          </select>
          <select class="settings-select settings-trigger-condition-operator"
                  data-trigger-cond-operator="${triggerIndex}:${condIndex}">
            ${CONDITION_OPERATORS.map(op =>
              `<option value="${op.value}" ${condition.operator === op.value ? 'selected' : ''}>${escapeHtml(op.label)}</option>`
            ).join('')}
          </select>
          <input type="text" class="settings-input settings-trigger-condition-value"
                 data-trigger-cond-value="${triggerIndex}:${condIndex}"
                 value="${escapeHtml(valueStr)}" placeholder="value or a, b, c">
          <button class="settings-btn settings-btn-icon" data-delete-trigger-condition="${triggerIndex}:${condIndex}" title="Delete condition">\u00d7</button>
        </div>
      `;
    }).join('');

    const actionRows = (trigger.actions || []).map((action, actionIndex) => {
      const isTriggerAction = action.type === 'disable_trigger' || action.type === 'enable_trigger';
      const triggerOptions = currentTriggers.triggers
        .map((t, i) => ({ name: t.name, index: i }))
        .filter(t => t.name && t.name.trim() !== ''); // Only show named triggers

      const valueInput = isTriggerAction
        ? `<select class="settings-select settings-trigger-action-value"
                  data-trigger-action-value="${triggerIndex}:${actionIndex}">
            <option value="">Select trigger...</option>
            ${triggerOptions.map(t =>
              `<option value="${escapeHtml(t.name)}" ${action.value === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
            ).join('')}
          </select>`
        : `<input type="text" class="settings-input settings-trigger-action-value"
                 data-trigger-action-value="${triggerIndex}:${actionIndex}"
                 value="${escapeHtml(action.value)}" placeholder="${action.type === 'send' ? 'command to send' : 'notification message'}">`;

      return `
        <div class="settings-trigger-action-row" data-trigger-action="${triggerIndex}:${actionIndex}">
          <select class="settings-select settings-trigger-action-type"
                  data-trigger-action-type="${triggerIndex}:${actionIndex}">
            ${ACTION_TYPES.map(at =>
              `<option value="${at.value}" ${action.type === at.value ? 'selected' : ''}>${escapeHtml(at.label)}</option>`
            ).join('')}
          </select>
          ${valueInput}
          <button class="settings-btn settings-btn-icon" data-delete-trigger-action="${triggerIndex}:${actionIndex}" title="Delete action">\u00d7</button>
        </div>
      `;
    }).join('');

    // Show message if no pattern groups are defined yet
    const patternsMessage = availableGroups.length === 0
      ? '<span class="settings-description">No pattern groups defined. Create patterns in the Patterns tab first.</span>'
      : (patternChips || '<span class="settings-description">Select pattern groups above.</span>');

    return `
      <div class="settings-pattern-group-card" data-trigger-index="${triggerIndex}">
        <div class="settings-pattern-group-header">
          <input type="checkbox" class="settings-checkbox" data-trigger-enabled="${triggerIndex}"
                 ${trigger.enabled ? 'checked' : ''}>
          <input type="text" class="settings-input settings-group-name-input"
                 data-trigger-name="${triggerIndex}"
                 value="${escapeHtml(trigger.name)}" placeholder="Trigger name">
          <button class="settings-btn settings-btn-icon" data-delete-trigger="${triggerIndex}" title="Delete trigger">\u00d7</button>
        </div>

        <div class="settings-trigger-subsection">
          <label class="settings-label">Patterns <span class="settings-description">(OR logic - any match fires)</span></label>
          <div class="settings-pane-pattern-chips">
            ${patternsMessage}
          </div>
        </div>

        <div class="settings-trigger-subsection">
          <label class="settings-label">Conditions <span class="settings-description">(optional, AND logic)</span></label>
          <div class="settings-trigger-conditions-list">
            ${conditionRows || ''}
          </div>
          <button class="settings-btn settings-btn-secondary"
                  data-add-trigger-condition="${triggerIndex}">+ Add Condition</button>
        </div>

        <div class="settings-trigger-subsection">
          <label class="settings-label">Actions</label>
          <div class="settings-trigger-actions-list">
            ${actionRows || ''}
          </div>
          <button class="settings-btn settings-btn-secondary"
                  data-add-trigger-action="${triggerIndex}">+ Add Action</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section">
      <h3>About Triggers</h3>
      <p class="settings-description">
        Triggers match MUD output with patterns and automatically execute commands.
        Define patterns in the <strong>Trigger Patterns</strong> tab, then select them here.
      </p>
      <details class="settings-help-details">
        <summary>How triggers work</summary>
        <div class="settings-help-content">
          <p>Select one or more patterns (OR logic). When any pattern matches,
          conditions are checked (AND logic). If all conditions pass, the actions are executed.</p>
          <ul>
            <li>Patterns are defined in the Trigger Patterns tab</li>
            <li>Conditions reference named capture groups from patterns</li>
            <li>Actions can be MUD commands or client commands (prefix with <code>/</code>)</li>
            <li>Use <code>/trigger disable trigger-name</code> as an action to disable another trigger</li>
          </ul>
        </div>
      </details>
    </div>

    <div class="settings-section">
      <h3>Triggers</h3>
      ${triggerCards || '<div class="settings-empty"><p>No triggers defined.</p></div>'}
    </div>

    <div class="settings-section">
      <button class="settings-btn settings-btn-secondary" id="add-trigger-btn">+ Add Trigger</button>
    </div>
  `;
}

function bindTriggerInputs() {
  // Enable/disable toggles
  document.querySelectorAll('[data-trigger-enabled]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.triggerEnabled!, 10);
    el.addEventListener('change', () => {
      currentTriggers.triggers[index].enabled = el.checked;
    });
  });

  // Trigger name inputs
  document.querySelectorAll('[data-trigger-name]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.triggerName!, 10);
    el.addEventListener('change', () => {
      const name = el.value.trim();
      if (name) {
        currentTriggers.triggers[index].name = name;
      } else {
        el.value = currentTriggers.triggers[index].name;
      }
    });
  });

  // Pattern group selection checkboxes (chips)
  document.querySelectorAll('[data-trigger-pattern-group]').forEach((input) => {
    const el = input as HTMLInputElement;
    const [triggerStr, groupName] = el.dataset.triggerPatternGroup!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);

    el.addEventListener('change', () => {
      const trigger = currentTriggers.triggers[triggerIndex];
      if (el.checked) {
        // Add group if not already present
        if (!trigger.patternGroups.includes(groupName)) {
          trigger.patternGroups.push(groupName);
        }
      } else {
        // Remove group
        trigger.patternGroups = trigger.patternGroups.filter(g => g !== groupName);
      }
      // Re-render to update capture group dropdowns in conditions
      render();
    });
  });

  // Condition capture selects
  document.querySelectorAll('[data-trigger-cond-capture]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const [triggerStr, condStr] = el.dataset.triggerCondCapture!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const condIndex = parseInt(condStr, 10);
    el.addEventListener('change', () => {
      const conditions = currentTriggers.triggers[triggerIndex].conditions;
      if (conditions) conditions[condIndex].capture = el.value;
    });
  });

  // Condition operator selects
  document.querySelectorAll('[data-trigger-cond-operator]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const [triggerStr, condStr] = el.dataset.triggerCondOperator!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const condIndex = parseInt(condStr, 10);
    el.addEventListener('change', () => {
      const conditions = currentTriggers.triggers[triggerIndex].conditions;
      if (conditions) conditions[condIndex].operator = el.value as any;
    });
  });

  // Condition value inputs
  document.querySelectorAll('[data-trigger-cond-value]').forEach((input) => {
    const el = input as HTMLInputElement;
    const [triggerStr, condStr] = el.dataset.triggerCondValue!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const condIndex = parseInt(condStr, 10);
    el.addEventListener('input', () => {
      const conditions = currentTriggers.triggers[triggerIndex].conditions;
      if (!conditions) return;
      const raw = el.value;
      // If contains comma, treat as array
      if (raw.includes(',')) {
        conditions[condIndex].value = raw.split(',').map(v => {
          const trimmed = v.trim();
          const num = Number(trimmed);
          return isNaN(num) ? trimmed : num;
        });
      } else {
        const num = Number(raw);
        conditions[condIndex].value = isNaN(num) ? raw : num;
      }
    });
  });

  // Delete condition buttons
  document.querySelectorAll('[data-delete-trigger-condition]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [triggerStr, condStr] = el.dataset.deleteTriggerCondition!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const condIndex = parseInt(condStr, 10);
    el.addEventListener('click', () => {
      currentTriggers.triggers[triggerIndex].conditions?.splice(condIndex, 1);
      render();
    });
  });

  // Add condition buttons
  document.querySelectorAll('[data-add-trigger-condition]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const triggerIndex = parseInt(el.dataset.addTriggerCondition!, 10);
    el.addEventListener('click', () => {
      const trigger = currentTriggers.triggers[triggerIndex];
      if (!trigger.conditions) trigger.conditions = [];
      trigger.conditions.push({ capture: '', operator: 'eq', value: '' });
      render();
      // Focus the new condition's capture dropdown
      const newCondIndex = trigger.conditions.length - 1;
      const captureSelect = document.querySelector(`[data-trigger-cond-capture="${triggerIndex}:${newCondIndex}"]`) as HTMLSelectElement;
      if (captureSelect) captureSelect.focus();
    });
  });

  // Action type selects
  document.querySelectorAll('[data-trigger-action-type]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const [triggerStr, actionStr] = el.dataset.triggerActionType!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('change', () => {
      const actions = currentTriggers.triggers[triggerIndex].actions;
      if (actions) {
        const oldType = actions[actionIndex].type;
        const newType = el.value as any;
        actions[actionIndex].type = newType;
        // Clear value when switching between trigger/non-trigger types (input changes)
        const wasTriggerType = oldType === 'disable_trigger' || oldType === 'enable_trigger';
        const isTriggerType = newType === 'disable_trigger' || newType === 'enable_trigger';
        if (wasTriggerType !== isTriggerType) {
          actions[actionIndex].value = '';
          render(); // Re-render to switch between input and select
        }
      }
    });
  });

  // Action value inputs (can be input or select)
  document.querySelectorAll('[data-trigger-action-value]').forEach((input) => {
    const el = input as HTMLInputElement | HTMLSelectElement;
    const [triggerStr, actionStr] = el.dataset.triggerActionValue!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      const actions = currentTriggers.triggers[triggerIndex].actions;
      if (actions) actions[actionIndex].value = el.value;
    });
  });

  // Delete action buttons
  document.querySelectorAll('[data-delete-trigger-action]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [triggerStr, actionStr] = el.dataset.deleteTriggerAction!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('click', () => {
      currentTriggers.triggers[triggerIndex].actions?.splice(actionIndex, 1);
      render();
    });
  });

  // Add action buttons
  document.querySelectorAll('[data-add-trigger-action]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const triggerIndex = parseInt(el.dataset.addTriggerAction!, 10);
    el.addEventListener('click', () => {
      const trigger = currentTriggers.triggers[triggerIndex];
      if (!trigger.actions) trigger.actions = [];
      trigger.actions.push({ type: 'send', value: '' });
      render();
      // Focus the new action's value input
      const newActionIndex = trigger.actions.length - 1;
      const valueInput = document.querySelector(`[data-trigger-action-value="${triggerIndex}:${newActionIndex}"]`) as HTMLInputElement;
      if (valueInput) valueInput.focus();
    });
  });

  // Delete trigger buttons
  document.querySelectorAll('[data-delete-trigger]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const triggerIndex = parseInt(el.dataset.deleteTrigger!, 10);
    el.addEventListener('click', () => {
      currentTriggers.triggers.splice(triggerIndex, 1);
      render();
    });
  });

  // Add trigger button
  document.getElementById('add-trigger-btn')?.addEventListener('click', () => {
    currentTriggers.triggers.push({
      name: '',
      patternGroups: [],
      actions: [{ type: 'send', value: '' }],
      enabled: true,
    });
    render();
    // Focus the new trigger's name input
    const newIndex = currentTriggers.triggers.length - 1;
    const nameInput = document.querySelector(`[data-trigger-name="${newIndex}"]`) as HTMLInputElement;
    if (nameInput) {
      nameInput.focus();
      nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
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

  // Pattern inputs (patterns tab)
  bindPatternInputs();

  // Notifications inputs (notifications tab)
  bindNotificationsInputs();

  // Trigger inputs (triggers tab)
  bindTriggerInputs();
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

  // Floating checkboxes
  document.querySelectorAll('[data-pane-floating]').forEach((input) => {
    const el = input as HTMLInputElement;
    const paneId = el.dataset.paneFloating!;
    el.addEventListener('change', () => {
      currentPanesConfig = updatePane(currentPanesConfig!, paneId, {
        position: el.checked ? 'floating' : 'top',
      });
      render(); // Re-render to update height input visibility
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

  // Pattern group checkboxes
  document.querySelectorAll('[data-pane-pattern]').forEach((input) => {
    const el = input as HTMLInputElement;
    const [paneId, groupName] = el.dataset.panePattern!.split(':');

    el.addEventListener('change', () => {
      const pane = currentPanesConfig!.panes.find(p => p.id === paneId);
      if (!pane) return;

      const currentPatternsList = pane.filter.patterns || [];
      let newPatterns: string[];

      if (el.checked) {
        // Add group
        newPatterns = [...currentPatternsList, groupName];
      } else {
        // Remove group
        newPatterns = currentPatternsList.filter(p => p !== groupName);
      }

      currentPanesConfig = updatePanePatterns(currentPanesConfig!, paneId, newPatterns);

      // Update chip visual state
      const label = el.parentElement;
      if (label) {
        label.classList.toggle('active', el.checked);
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

function bindPatternInputs() {
  // Helper to update validation indicator
  const updateValidation = (input: HTMLInputElement, validationEl: Element | null | undefined) => {
    const result = validateRegex(input.value);
    const isValid = result === null;
    input.classList.toggle('settings-pattern-invalid', !isValid);
    if (validationEl) {
      validationEl.className = `settings-pattern-validation ${isValid ? 'valid' : 'invalid'}`;
      validationEl.textContent = isValid ? '\u2713' : '\u2717';
    }
  };

  // Pattern inputs within groups
  document.querySelectorAll('[data-pattern-input]').forEach((input) => {
    const el = input as HTMLInputElement;
    const [groupName, indexStr] = el.dataset.patternInput!.split(':');
    const index = parseInt(indexStr, 10);
    const validationEl = el.parentElement?.querySelector('.settings-pattern-validation');

    el.addEventListener('input', () => {
      updateValidation(el, validationEl);
      if (currentPatterns.groups[groupName]) {
        currentPatterns.groups[groupName][index] = el.value;
      }
    });
  });

  // Rename group inputs
  document.querySelectorAll('[data-rename-group]').forEach((input) => {
    const el = input as HTMLInputElement;
    const originalName = el.dataset.renameGroup!;

    el.addEventListener('change', () => {
      const newName = el.value.trim();
      if (newName && newName !== originalName && !currentPatterns.groups[newName]) {
        // Rename the group
        currentPatterns.groups[newName] = currentPatterns.groups[originalName];
        delete currentPatterns.groups[originalName];

        // Update all triggers that reference this group
        for (const trigger of currentTriggers.triggers) {
          const idx = trigger.patternGroups.indexOf(originalName);
          if (idx !== -1) {
            trigger.patternGroups[idx] = newName;
          }
        }

        // Update notifications that reference this group
        const notifyIdx = currentNotifications.groups.indexOf(originalName);
        if (notifyIdx !== -1) {
          currentNotifications.groups[notifyIdx] = newName;
        }

        render();
      } else if (!newName || currentPatterns.groups[newName]) {
        // Invalid or duplicate name, revert
        el.value = originalName;
      }
    });
  });

  // Delete group buttons
  document.querySelectorAll('[data-delete-group]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const groupName = el.dataset.deleteGroup!;

    el.addEventListener('click', () => {
      delete currentPatterns.groups[groupName];

      // Remove from all triggers that reference this group
      for (const trigger of currentTriggers.triggers) {
        trigger.patternGroups = trigger.patternGroups.filter(g => g !== groupName);
      }

      // Remove from notifications
      currentNotifications.groups = currentNotifications.groups.filter(g => g !== groupName);

      render();
    });
  });

  // Add group button
  document.getElementById('add-group-btn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('new-group-name') as HTMLInputElement;
    const name = nameInput?.value.trim();

    if (name && !currentPatterns.groups[name]) {
      currentPatterns.groups[name] = [];
      render();
    }
  });

  // Add pattern buttons
  document.querySelectorAll('[data-add-pattern]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const groupName = el.dataset.addPattern!;

    el.addEventListener('click', () => {
      if (currentPatterns.groups[groupName]) {
        currentPatterns.groups[groupName].push('');
        render();
        // Focus the newly added pattern input
        const newIndex = currentPatterns.groups[groupName].length - 1;
        const newInput = document.querySelector(`[data-pattern-input="${groupName}:${newIndex}"]`) as HTMLInputElement;
        if (newInput) {
          newInput.focus();
          newInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  });

  // Delete pattern buttons
  document.querySelectorAll('[data-delete-pattern]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [groupName, indexStr] = el.dataset.deletePattern!.split(':');
    const index = parseInt(indexStr, 10);

    el.addEventListener('click', () => {
      if (currentPatterns.groups[groupName]) {
        currentPatterns.groups[groupName].splice(index, 1);
        render();
      }
    });
  });

  // Continuation pattern
  const continuationInput = document.getElementById('continuation-pattern') as HTMLInputElement;
  const continuationValidation = document.getElementById('continuation-validation');
  if (continuationInput) {
    const updateContinuationValidation = () => {
      const value = continuationInput.value.trim();
      if (value) {
        const result = validateRegex(value);
        const isValid = result === null;
        continuationInput.classList.toggle('settings-pattern-invalid', !isValid);
        if (continuationValidation) {
          continuationValidation.className = `settings-pattern-validation ${isValid ? 'valid' : 'invalid'}`;
          continuationValidation.textContent = isValid ? '\u2713' : '\u2717';
        }
      } else {
        continuationInput.classList.remove('settings-pattern-invalid');
        if (continuationValidation) {
          continuationValidation.className = 'settings-pattern-validation';
          continuationValidation.textContent = '';
        }
      }
    };

    continuationInput.addEventListener('input', () => {
      updateContinuationValidation();
      currentPatterns.continuation = continuationInput.value.trim() || undefined;
    });

    // Initial validation state
    updateContinuationValidation();
  }

  // Pattern tester
  document.getElementById('pattern-test-btn')?.addEventListener('click', () => {
    const testInput = document.getElementById('pattern-test-input') as HTMLInputElement;
    const resultDiv = document.getElementById('pattern-test-result');

    if (!testInput || !resultDiv) return;

    const testString = testInput.value;
    if (!testString) {
      resultDiv.innerHTML = '<span class="test-error">Please enter a test string</span>';
      return;
    }

    const results: string[] = [];

    for (const [groupName, patterns] of Object.entries(currentPatterns.groups)) {
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        if (!pattern) continue;

        try {
          const regex = new RegExp(pattern);
          const match = regex.exec(testString);

          if (match) {
            let html = `<div class="test-match-item">
              <div class="test-match-header"><span class="test-success">${escapeHtml(groupName)}</span> pattern ${i + 1} matched</div>`;
            if (match.groups && Object.keys(match.groups).length > 0) {
              html += '<div class="test-captures-grid">';
              for (const [name, value] of Object.entries(match.groups)) {
                html += `<div class="test-capture"><span class="test-capture-name">${escapeHtml(name)}</span><span class="test-capture-value">${escapeHtml(value || '')}</span></div>`;
              }
              html += '</div>';
            }
            html += '</div>';
            results.push(html);
          }
        } catch {
          results.push(`<div class="test-match-item"><span class="test-error">${escapeHtml(groupName)}</span> pattern ${i + 1}: invalid regex</div>`);
        }
      }
    }

    if (results.length === 0) {
      resultDiv.innerHTML = '<span class="test-no-match">No patterns matched</span>';
    } else {
      resultDiv.innerHTML = results.join('');
    }
  });
}

function bindNotificationsInputs() {
  // Master enable toggle
  const enabledInput = document.getElementById('notifications-enabled') as HTMLInputElement;
  if (enabledInput) {
    enabledInput.addEventListener('change', () => {
      currentNotifications.enabled = enabledInput.checked;
    });
  }

  // Pattern group checkboxes
  document.querySelectorAll('[data-notify-group]').forEach((input) => {
    const el = input as HTMLInputElement;
    const groupName = el.dataset.notifyGroup!;

    el.addEventListener('change', () => {
      if (el.checked) {
        if (!currentNotifications.groups.includes(groupName)) {
          currentNotifications.groups.push(groupName);
        }
      } else {
        currentNotifications.groups = currentNotifications.groups.filter(g => g !== groupName);
      }
      // Update chip visual state
      const label = el.parentElement;
      if (label) {
        label.classList.toggle('active', el.checked);
      }
    });
  });

  // Test notification button
  const testBtn = document.getElementById('test-notification-btn');
  const statusEl = document.getElementById('notification-status');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      if (statusEl) statusEl.textContent = 'Checking permission...';

      try {
        let permissionGranted = await isPermissionGranted();

        if (!permissionGranted) {
          if (statusEl) statusEl.textContent = 'Requesting permission...';
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }

        if (permissionGranted) {
          if (statusEl) statusEl.textContent = 'Sending notification...';
          await sendNotification({
            title: 'Twilite',
            body: 'Test notification - notifications are working!',
            icon: 'icons/128x128.png',
          });
          if (statusEl) statusEl.textContent = 'Notification sent!';
        } else {
          if (statusEl) statusEl.textContent = 'Permission denied. Check System Settings > Notifications.';
        }
      } catch (err) {
        console.error('Notification error:', err);
        if (statusEl) statusEl.textContent = `Error: ${err}`;
      }
    });
  }
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
      savePatternsConfig(currentPatterns),
      saveNotificationsConfig(currentNotifications),
      saveTriggersConfig(currentTriggers),
    ];
    if (currentPanesConfig) {
      saves.push(savePanesConfig(currentPanesConfig));
    }
    await Promise.all(saves);
    await emitSettingsChange();
    await emitConfigChange();
    await emitPanesConfigChange();
    await emitPatternsConfigChange();
    await emitNotificationsConfigChange();
    await emitTriggersConfigChange();
    getCurrentWindow().close();
  });

  document.getElementById('cancel-btn')?.addEventListener('click', async () => {
    // Revert to original settings
    await emit('settings-changed', originalSettings);
    getCurrentWindow().close();
  });

  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    // Reset only applies to Terminal settings
    currentSettings = await resetSettings();
    emitSettingsChange();
    // Note: No reset for panes - they need the YAML file
    render();
  });
}

async function emitSettingsChange() {
  await emit('settings-changed', currentSettings);
}

async function emitConfigChange() {
  await emit('config-changed', currentConfig);
}

async function emitPanesConfigChange() {
  if (currentPanesConfig) {
    await emit('panes-config-changed', currentPanesConfig);
  }
}

async function emitPatternsConfigChange() {
  await emit('patterns-config-changed', currentPatterns);
}

async function emitNotificationsConfigChange() {
  await emit('notifications-config-changed', currentNotifications);
}

async function emitTriggersConfigChange() {
  await emit('triggers-config-changed', currentTriggers);
}

// Handle Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    emit('settings-changed', originalSettings);
    getCurrentWindow().close();
  }
});

init();
