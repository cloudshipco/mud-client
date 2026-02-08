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
import { COLOR_SCHEME_OPTIONS, getColorScheme, type ColorSchemeName } from './types/color-schemes';
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
  TriggerActionType,
  ConditionOperator,
  CONDITION_OPERATORS,
  ACTION_TYPES,
  loadTriggersConfig,
  saveTriggersConfig,
  resetTriggersConfig,
} from './services/triggers-config-store';
import {
  TimersConfig,
  TimerDefinition,
  loadTimersConfig,
  saveTimersConfig,
  resetTimersConfig,
  TriggerAction as TimerAction,
} from './services/timers-config-store';

// Timer action types (subset of trigger actions + timer-specific)
const TIMER_ACTION_TYPES: { value: TriggerActionType; label: string }[] = [
  { value: 'send', label: 'Send command' },
  { value: 'notify', label: 'Notification' },
  { value: 'disable_trigger', label: 'Disable trigger' },
  { value: 'enable_trigger', label: 'Enable trigger' },
  { value: 'disable_timer', label: 'Disable timer' },
  { value: 'enable_timer', label: 'Enable timer' },
  { value: 'wait', label: 'Wait (ms)' },
];
import {
  GaugesConfig,
  GaugeConfig,
  loadGaugesConfig,
  saveGaugesConfig,
  addGauge,
  removeGauge,
  updateGauge,
} from './services/gauges-config-store';
import {
  ProfilesConfig,
  ProfileConfig,
  loadProfilesConfig,
  saveProfilesConfig,
  resetProfilesConfig,
  createProfile,
  duplicateProfile,
  deleteProfile,
  getProfile,
  getProfilesContainingItem,
  slugify as profileSlugify,
  generateProfileId,
} from './services/profiles-config-store';
import {
  ConnectionWithCharacters,
  CharacterConfig as GuiCharacterConfig,
  ConnectionConfig as GuiConnectionConfig,
  loadConnectionsWithCharacters,
  saveCharacter,
  deleteCharacter,
  createConnection,
  createCharacter,
  formatLastUsed,
} from './services/characters-config-store';
import {
  escapeHtml,
  Card,
  Subsection,
  ItemList,
  ConditionsList,
  FormRow,
  ActionRow,
  ActionList,
  ConditionRow,
  Chip,
  ChipContainer,
  SecondaryText,
} from './components/settings';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager';

type TabId = 'terminal' | 'config' | 'characters' | 'panes' | 'aliases' | 'patterns' | 'notifications' | 'triggers' | 'timers' | 'gauges' | 'profiles';

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

/**
 * Build profile indicator HTML showing which profiles include an item.
 * Returns empty string if no profiles are defined.
 */
function buildProfileIndicator(
  itemType: 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges',
  itemName: string
): string {
  if (currentProfiles.profiles.length === 0) return '';

  const includingProfiles = getProfilesContainingItem(currentProfiles, itemType, itemName);

  if (includingProfiles.length === 0) {
    return `<div class="settings-profile-indicator settings-profile-indicator-none">Not in any profile</div>`;
  }

  if (includingProfiles.length === currentProfiles.profiles.length) {
    return `<div class="settings-profile-indicator settings-profile-indicator-all">In all profiles</div>`;
  }

  const profileList = includingProfiles.slice(0, 3).map(p => escapeHtml(p)).join(', ');
  const suffix = includingProfiles.length > 3 ? ` +${includingProfiles.length - 3} more` : '';

  return `<div class="settings-profile-indicator">Profiles: ${profileList}${suffix}</div>`;
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
let currentTimers: TimersConfig = { timers: [] };
let originalTimers: TimersConfig = { timers: [] };
let currentGauges: GaugesConfig = { gauges: [], statusLine: { enabled: true, position: 'above-input' } };
let originalGauges: GaugesConfig = { gauges: [], statusLine: { enabled: true, position: 'above-input' } };
let currentProfiles: ProfilesConfig = { profiles: [] };
let originalProfiles: ProfilesConfig = { profiles: [] };
let editingProfileIndex: number | null = null;  // Index of profile being edited, null for list view
let connectionsWithCharacters: ConnectionWithCharacters[] = [];
let editingCharacter: { connectionId: string; characterId: string } | null = null;
let activeTab: TabId = 'terminal';

// Conflict resolution state for import
type ConflictResolution = 'replace' | 'rename' | 'skip';
interface ImportConflict {
  type: 'pattern' | 'trigger';
  name: string;
  existing: unknown;
  incoming: unknown;
}
let pendingConflicts: ImportConflict[] = [];
let currentConflictIndex = 0;
let conflictCallback: ((resolution: ConflictResolution) => void) | null = null;

/**
 * Escape YAML string (double single quotes)
 */
function escapeYamlStr(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Generate YAML for a single pattern group (for clipboard export)
 */
function patternGroupToYaml(groupName: string, patterns: string[]): string {
  const lines: string[] = ['groups:'];
  lines.push(`  ${groupName}:`);
  if (patterns.length === 0) {
    lines.push('    []');
  } else {
    for (const pattern of patterns) {
      lines.push(`    - '${escapeYamlStr(pattern)}'`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Generate YAML for a single trigger (for clipboard export)
 */
function triggerToYaml(trigger: TriggerDefinition): string {
  const lines: string[] = ['triggers:'];
  lines.push(`  - name: '${escapeYamlStr(trigger.name)}'`);

  lines.push('    patternGroups:');
  if (trigger.patternGroups.length === 0) {
    lines.push('      []');
  } else {
    for (const group of trigger.patternGroups) {
      lines.push(`      - '${escapeYamlStr(group)}'`);
    }
  }

  const validConditions = (trigger.conditions || []).filter(c => c.capture?.trim());
  if (validConditions.length > 0) {
    lines.push('    conditions:');
    for (const condition of validConditions) {
      lines.push(`      - capture: '${escapeYamlStr(condition.capture)}'`);
      lines.push(`        operator: ${condition.operator}`);
      if (Array.isArray(condition.value)) {
        const items = condition.value.map(v =>
          typeof v === 'number' ? String(v) : `'${escapeYamlStr(String(v))}'`
        ).join(', ');
        lines.push(`        value: [${items}]`);
      } else if (typeof condition.value === 'number') {
        lines.push(`        value: ${condition.value}`);
      } else {
        lines.push(`        value: '${escapeYamlStr(String(condition.value))}'`);
      }
    }
  }

  const validActions = (trigger.actions || []).filter(a => a.value?.trim());
  if (validActions.length > 0) {
    lines.push('    actions:');
    for (const action of validActions) {
      lines.push(`      - type: ${action.type}`);
      lines.push(`        value: '${escapeYamlStr(action.value)}'`);
    }
  }

  lines.push(`    enabled: ${trigger.enabled}`);
  return lines.join('\n') + '\n';
}

/**
 * Parse YAML clipboard content to detect type and extract data
 */
function parseClipboardYaml(content: string): { type: 'patterns' | 'triggers' | 'unknown'; data: unknown } {
  const trimmed = content.trim();

  // Detect content type
  if (trimmed.startsWith('groups:')) {
    return { type: 'patterns', data: parsePatternGroupsYaml(content) };
  } else if (trimmed.startsWith('triggers:')) {
    return { type: 'triggers', data: parseTriggersYaml(content) };
  }

  return { type: 'unknown', data: null };
}

/**
 * Parse pattern groups from YAML string
 */
function parsePatternGroupsYaml(content: string): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const lines = content.split('\n');

  let currentGroup: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Skip 'groups:' line
    if (line.match(/^groups:\s*$/)) continue;

    // Group name at 2-space indent
    const groupMatch = line.match(/^  (\w[\w-]*):\s*$/);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      groups[currentGroup] = [];
      continue;
    }

    // Pattern at 4-space indent
    if (currentGroup) {
      const patternMatch = line.match(/^\s{4}-\s*["']?(.+?)["']?\s*$/);
      if (patternMatch) {
        groups[currentGroup].push(patternMatch[1]);
      }
    }
  }

  return groups;
}

/**
 * Parse triggers from YAML string
 */
function parseTriggersYaml(content: string): TriggerDefinition[] {
  const triggers: TriggerDefinition[] = [];
  const lines = content.split('\n');

  let currentTrigger: Partial<TriggerDefinition> | null = null;
  let listContext: 'patternGroups' | 'conditions' | 'actions' | null = null;
  let currentCondition: Partial<TriggerCondition> | null = null;
  let currentAction: Partial<TriggerAction> | null = null;
  let conditionValueItems: (string | number)[] = [];

  const finishCondition = () => {
    if (currentCondition && currentTrigger) {
      if (!currentTrigger.conditions) currentTrigger.conditions = [];
      if (conditionValueItems.length > 0) {
        currentCondition.value = conditionValueItems;
        conditionValueItems = [];
      }
      currentTrigger.conditions.push(currentCondition as TriggerCondition);
      currentCondition = null;
    }
  };

  const finishAction = () => {
    if (currentAction && currentTrigger) {
      if (!currentTrigger.actions) currentTrigger.actions = [];
      if (currentAction.type && currentAction.value !== undefined) {
        currentTrigger.actions.push(currentAction as TriggerAction);
      }
      currentAction = null;
    }
  };

  const finishTrigger = () => {
    finishCondition();
    finishAction();
    if (currentTrigger && currentTrigger.name) {
      triggers.push({
        name: currentTrigger.name,
        patternGroups: currentTrigger.patternGroups || [],
        conditions: currentTrigger.conditions,
        actions: currentTrigger.actions || [],
        enabled: currentTrigger.enabled !== false,
      });
    }
    currentTrigger = null;
    listContext = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top level 'triggers:' key
    if (line.match(/^triggers:\s*$/)) continue;

    // New trigger item: "  - name: ..."
    const newTriggerMatch = line.match(/^  - name:\s*["']?(.+?)["']?\s*$/);
    if (newTriggerMatch) {
      finishTrigger();
      currentTrigger = { name: newTriggerMatch[1], patternGroups: [] };
      listContext = null;
      continue;
    }

    if (!currentTrigger) continue;

    // Trigger properties at 4-space indent
    const propMatch = line.match(/^    (\w+):\s*(.*)$/);
    if (propMatch && !line.match(/^      /)) {
      const [, key, rawValue] = propMatch;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();

      switch (key) {
        case 'patternGroups':
          listContext = 'patternGroups';
          continue;
        case 'conditions':
          listContext = 'conditions';
          continue;
        case 'actions':
          listContext = 'actions';
          continue;
        case 'enabled':
          currentTrigger.enabled = value !== 'false';
          listContext = null;
          continue;
      }
    }

    // List items at 6-space indent
    if (listContext === 'patternGroups') {
      const groupMatch = line.match(/^\s{6}-\s*["']?(.+?)["']?\s*$/);
      if (groupMatch) {
        currentTrigger.patternGroups!.push(groupMatch[1]);
        continue;
      }
    }

    if (listContext === 'conditions') {
      // New condition: "      - capture: ..."
      const condStartMatch = line.match(/^\s{6}- capture:\s*["']?(.+?)["']?\s*$/);
      if (condStartMatch) {
        finishCondition();
        currentCondition = { capture: condStartMatch[1] };
        conditionValueItems = [];
        continue;
      }

      if (currentCondition) {
        const operatorMatch = line.match(/^\s{8}operator:\s*["']?(.+?)["']?\s*$/);
        if (operatorMatch) {
          currentCondition.operator = operatorMatch[1] as ConditionOperator;
          continue;
        }

        const inlineArrayMatch = line.match(/^\s{8}value:\s*\[(.+)\]\s*$/);
        if (inlineArrayMatch) {
          currentCondition.value = inlineArrayMatch[1]
            .split(',')
            .map(v => v.trim().replace(/^["']|["']$/g, ''))
            .map(v => { const n = Number(v); return isNaN(n) ? v : n; });
          continue;
        }

        const scalarMatch = line.match(/^\s{8}value:\s*["']?(.+?)["']?\s*$/);
        if (scalarMatch) {
          const raw = scalarMatch[1];
          const num = Number(raw);
          currentCondition.value = isNaN(num) ? raw : num;
          continue;
        }

        if (line.match(/^\s{8}value:\s*$/)) {
          conditionValueItems = [];
          continue;
        }

        const valueItemMatch = line.match(/^\s{10}-\s*["']?(.+?)["']?\s*$/);
        if (valueItemMatch) {
          const raw = valueItemMatch[1];
          const num = Number(raw);
          conditionValueItems.push(isNaN(num) ? raw : num);
          continue;
        }
      }
    }

    if (listContext === 'actions') {
      const actionStartMatch = line.match(/^\s{6}- type:\s*["']?(.+?)["']?\s*$/);
      if (actionStartMatch) {
        finishAction();
        currentAction = { type: actionStartMatch[1] as TriggerActionType };
        continue;
      }

      if (currentAction) {
        const valueMatch = line.match(/^\s{8}value:\s*["']?(.+?)["']?\s*$/);
        if (valueMatch) {
          currentAction.value = valueMatch[1];
          continue;
        }
      }
    }
  }

  finishTrigger();
  return triggers;
}

/**
 * Copy pattern group to clipboard
 */
async function copyPatternGroup(groupName: string): Promise<void> {
  const patterns = currentPatterns.groups[groupName];
  if (!patterns) return;

  const yaml = patternGroupToYaml(groupName, patterns);
  await writeText(yaml);
  showCopyFeedback(`Copied "${groupName}" to clipboard`);
}

/**
 * Copy trigger to clipboard
 */
async function copyTrigger(triggerIndex: number): Promise<void> {
  const trigger = currentTriggers.triggers[triggerIndex];
  if (!trigger) return;

  const yaml = triggerToYaml(trigger);
  await writeText(yaml);
  showCopyFeedback(`Copied "${trigger.name || 'trigger'}" to clipboard`);
}

/**
 * Show temporary feedback message
 */
function showCopyFeedback(message: string): void {
  // Create feedback element
  const feedback = document.createElement('div');
  feedback.className = 'settings-copy-feedback';
  feedback.textContent = message;
  document.body.appendChild(feedback);

  // Animate and remove
  setTimeout(() => feedback.classList.add('show'), 10);
  setTimeout(() => {
    feedback.classList.remove('show');
    setTimeout(() => feedback.remove(), 200);
  }, 1500);
}

/**
 * Generate a unique name by appending -1, -2, etc.
 */
function generateUniqueName(baseName: string, existingNames: string[]): string {
  let counter = 1;
  let newName = `${baseName}-${counter}`;
  while (existingNames.includes(newName)) {
    counter++;
    newName = `${baseName}-${counter}`;
  }
  return newName;
}

/**
 * Show conflict resolution modal
 */
function showConflictModal(conflict: ImportConflict): Promise<ConflictResolution> {
  return new Promise((resolve) => {
    conflictCallback = resolve;

    const modal = document.createElement('div');
    modal.className = 'settings-modal-overlay';
    modal.id = 'conflict-modal';
    modal.innerHTML = `
      <div class="settings-modal">
        <h3>Name Conflict</h3>
        <p>${conflict.type === 'pattern' ? 'Pattern group' : 'Trigger'} <strong>"${escapeHtml(conflict.name)}"</strong> already exists.</p>
        <p class="settings-description">What would you like to do?</p>
        <div class="settings-modal-buttons">
          <button class="settings-btn settings-btn-primary" data-conflict-action="replace">Replace Existing</button>
          <button class="settings-btn settings-btn-secondary" data-conflict-action="rename">Import as Copy</button>
          <button class="settings-btn settings-btn-secondary" data-conflict-action="skip">Skip</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind buttons
    modal.querySelectorAll('[data-conflict-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.conflictAction as ConflictResolution;
        modal.remove();
        if (conflictCallback) {
          conflictCallback(action);
          conflictCallback = null;
        }
      });
    });
  });
}

/**
 * Import from clipboard for patterns tab
 */
async function importPatternsFromClipboard(): Promise<void> {
  try {
    const text = await readText();
    if (!text || !text.trim()) {
      showCopyFeedback('Clipboard is empty');
      return;
    }

    const parsed = parseClipboardYaml(text);

    if (parsed.type !== 'patterns') {
      showCopyFeedback('Clipboard does not contain pattern groups');
      return;
    }

    const importedGroups = parsed.data as Record<string, string[]>;
    const groupNames = Object.keys(importedGroups);

    if (groupNames.length === 0) {
      showCopyFeedback('No pattern groups found');
      return;
    }

    let imported = 0;
    let skipped = 0;

    for (const name of groupNames) {
      const patterns = importedGroups[name];

      if (currentPatterns.groups[name]) {
        // Conflict - ask user
        const resolution = await showConflictModal({
          type: 'pattern',
          name,
          existing: currentPatterns.groups[name],
          incoming: patterns,
        });

        switch (resolution) {
          case 'replace':
            currentPatterns.groups[name] = patterns;
            imported++;
            break;
          case 'rename':
            const newName = generateUniqueName(name, Object.keys(currentPatterns.groups));
            currentPatterns.groups[newName] = patterns;
            imported++;
            break;
          case 'skip':
            skipped++;
            break;
        }
      } else {
        // No conflict - just import
        currentPatterns.groups[name] = patterns;
        imported++;
      }
    }

    render();
    const msg = skipped > 0
      ? `Imported ${imported} group(s), skipped ${skipped}`
      : `Imported ${imported} group(s)`;
    showCopyFeedback(msg);
  } catch (err) {
    console.error('Import error:', err);
    showCopyFeedback('Failed to import from clipboard');
  }
}

/**
 * Import from clipboard for triggers tab
 */
async function importTriggersFromClipboard(): Promise<void> {
  try {
    const text = await readText();
    if (!text || !text.trim()) {
      showCopyFeedback('Clipboard is empty');
      return;
    }

    const parsed = parseClipboardYaml(text);

    if (parsed.type !== 'triggers') {
      showCopyFeedback('Clipboard does not contain triggers');
      return;
    }

    const importedTriggers = parsed.data as TriggerDefinition[];

    if (importedTriggers.length === 0) {
      showCopyFeedback('No triggers found');
      return;
    }

    let imported = 0;
    let skipped = 0;
    const existingNames = currentTriggers.triggers.map(t => t.name);

    for (const trigger of importedTriggers) {
      const existingIndex = currentTriggers.triggers.findIndex(t => t.name === trigger.name);

      if (existingIndex !== -1) {
        // Conflict - ask user
        const resolution = await showConflictModal({
          type: 'trigger',
          name: trigger.name,
          existing: currentTriggers.triggers[existingIndex],
          incoming: trigger,
        });

        switch (resolution) {
          case 'replace':
            currentTriggers.triggers[existingIndex] = trigger;
            imported++;
            break;
          case 'rename':
            const newName = generateUniqueName(trigger.name, existingNames);
            trigger.name = newName;
            existingNames.push(newName);
            currentTriggers.triggers.push(trigger);
            imported++;
            break;
          case 'skip':
            skipped++;
            break;
        }
      } else {
        // No conflict - just import
        currentTriggers.triggers.push(trigger);
        existingNames.push(trigger.name);
        imported++;
      }
    }

    render();
    const msg = skipped > 0
      ? `Imported ${imported} trigger(s), skipped ${skipped}`
      : `Imported ${imported} trigger(s)`;
    showCopyFeedback(msg);
  } catch (err) {
    console.error('Import error:', err);
    showCopyFeedback('Failed to import from clipboard');
  }
}

async function init() {
  [currentSettings, currentConfig, currentPanesConfig, currentAliases, currentPatterns, currentNotifications, currentTriggers, currentTimers, currentGauges, currentProfiles] = await Promise.all([
    loadSettings(),
    loadConfig(),
    loadPanesConfig(),
    loadAliases(),
    loadPatternsConfig(),
    loadNotificationsConfig(),
    loadTriggersConfig(),
    loadTimersConfig(),
    loadGaugesConfig(),
    loadProfilesConfig(),
  ]);
  // Load connections separately (not part of save/restore flow)
  connectionsWithCharacters = await loadConnectionsWithCharacters();

  originalSettings = JSON.parse(JSON.stringify(currentSettings));
  originalConfig = JSON.parse(JSON.stringify(currentConfig));
  originalPanesConfig = currentPanesConfig ? JSON.parse(JSON.stringify(currentPanesConfig)) : null;
  originalAliases = JSON.parse(JSON.stringify(currentAliases));
  originalPatterns = JSON.parse(JSON.stringify(currentPatterns));
  originalNotifications = JSON.parse(JSON.stringify(currentNotifications));
  originalTriggers = JSON.parse(JSON.stringify(currentTriggers));
  originalTimers = JSON.parse(JSON.stringify(currentTimers));
  originalGauges = JSON.parse(JSON.stringify(currentGauges));
  originalProfiles = JSON.parse(JSON.stringify(currentProfiles));
  render();
}

function buildTabContent(): string {
  switch (activeTab) {
    case 'terminal': return buildTerminalSections();
    case 'config': return buildConfigSection();
    case 'characters': return buildCharactersSection();
    case 'panes': return buildPanesSection();
    case 'aliases': return buildAliasesSection();
    case 'patterns': return buildPatternsSection();
    case 'notifications': return buildNotificationsSection();
    case 'triggers': return buildTriggersSection();
    case 'timers': return buildTimersSection();
    case 'gauges': return buildGaugesSection();
    case 'profiles': return buildProfilesSection();
    default: return '';
  }
}

function render() {
  const root = document.getElementById('settings-root');
  if (!root) return;

  root.innerHTML = `
    <div class="settings-container">
      <div class="settings-sidebar">
        <div class="settings-sidebar-section">
          <div class="settings-sidebar-label">General</div>
          <div class="settings-tabs">
            <button class="settings-tab ${activeTab === 'terminal' ? 'active' : ''}" data-tab="terminal">Terminal</button>
            <button class="settings-tab ${activeTab === 'config' ? 'active' : ''}" data-tab="config">Config</button>
            <button class="settings-tab ${activeTab === 'characters' ? 'active' : ''}" data-tab="characters">Characters</button>
            <button class="settings-tab ${activeTab === 'profiles' ? 'active' : ''}" data-tab="profiles">Profiles</button>
          </div>
        </div>
        <div class="settings-sidebar-section">
          <div class="settings-sidebar-label">Automation</div>
          <div class="settings-tabs">
            <button class="settings-tab ${activeTab === 'aliases' ? 'active' : ''}" data-tab="aliases">Aliases</button>
            <button class="settings-tab ${activeTab === 'triggers' ? 'active' : ''}" data-tab="triggers">Triggers</button>
            <button class="settings-tab ${activeTab === 'timers' ? 'active' : ''}" data-tab="timers">Timers</button>
            <button class="settings-tab ${activeTab === 'patterns' ? 'active' : ''}" data-tab="patterns">Patterns</button>
          </div>
        </div>
        <div class="settings-sidebar-section">
          <div class="settings-sidebar-label">Display</div>
          <div class="settings-tabs">
            <button class="settings-tab ${activeTab === 'panes' ? 'active' : ''}" data-tab="panes">Panes</button>
            <button class="settings-tab ${activeTab === 'gauges' ? 'active' : ''}" data-tab="gauges">Gauges</button>
            <button class="settings-tab ${activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">Notifications</button>
          </div>
        </div>
      </div>
      <div class="settings-main">
        <div class="settings-content">
          ${buildTabContent()}
        </div>
        <div class="settings-footer">
          ${activeTab === 'terminal' ? '<button class="settings-btn settings-btn-danger" id="reset-btn">Reset to Defaults</button>' : ''}
          <button class="settings-btn settings-btn-secondary" id="cancel-btn">Cancel</button>
          <button class="settings-btn settings-btn-primary" id="apply-btn">Apply</button>
        </div>
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
  `;
}

// escapeHtml is imported from './components/settings'

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

    // Build pattern chips using Chip component
    const patternChips = availableGroups.length > 0
      ? availableGroups.map(group =>
          Chip({
            label: group,
            selected: currentPanePatterns.includes(group),
            dataAttr: 'pane-pattern',
            value: `${pane.id}:${group}`,
          })
        ).join('')
      : SecondaryText('No pattern groups defined. Create them in the Patterns tab.');

    return `
      <div class="settings-pattern-group-card" data-pane-id="${pane.id}">
        <div class="settings-pattern-group-header">
          <input type="checkbox" class="settings-checkbox" data-pane-enabled="${pane.id}"
                 ${pane.enabled !== false ? 'checked' : ''}>
          <span class="settings-group-name-input" style="background: transparent; border: none; cursor: default;">${escapeHtml(pane.id)}</span>
        </div>
        ${Subsection({
          label: 'Options',
          children: `
            <div class="settings-pane-options">
              <div class="settings-pane-option">
                <label class="settings-label">Float</label>
                <input type="checkbox" class="settings-checkbox" data-pane-floating="${pane.id}"
                       ${pane.position === 'floating' ? 'checked' : ''}>
              </div>
              <div class="settings-pane-option"${pane.position === 'floating' ? ' style="opacity: 0.4; pointer-events: none;"' : ''}>
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
          `,
        })}
        ${Subsection({
          label: 'Pattern Groups',
          children: ChipContainer({ children: patternChips }),
        })}
        ${buildProfileIndicator('panes', pane.id)}
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

  const aliasRows = aliasEntries.map(([name, expansion]) => {
    const profileIndicator = buildProfileIndicator('aliases', name);
    return `
      <div class="settings-alias-row" data-alias-name="${escapeHtml(name)}">
        <input type="text" class="settings-input settings-alias-name" data-alias-key="${escapeHtml(name)}"
               value="${escapeHtml(name)}" placeholder="Alias name">
        <input type="text" class="settings-input settings-alias-expansion" data-alias-value="${escapeHtml(name)}"
               value="${escapeHtml(expansion)}" placeholder="Expansion">
        <button class="settings-btn settings-btn-icon" data-alias-delete="${escapeHtml(name)}" title="Delete alias">×</button>
        ${profileIndicator ? `<span class="settings-alias-profile-hint" title="${escapeHtml(profileIndicator.replace(/<[^>]*>/g, ''))}">\u2139</span>` : ''}
      </div>
    `;
  }).join('');

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
          <button class="settings-btn settings-btn-icon settings-btn-copy" data-copy-pattern-group="${escapeHtml(groupName)}" title="Copy to clipboard">&#x2398;</button>
          <button class="settings-btn settings-btn-icon" data-delete-group="${escapeHtml(groupName)}" title="Delete group">\u00d7</button>
        </div>
        <div class="settings-patterns-list">
          ${buildGroupPatternRows(groupName, patterns)}
        </div>
        <button class="settings-btn settings-btn-secondary settings-pattern-add" data-add-pattern="${escapeHtml(groupName)}">+ Add Pattern</button>
        ${buildProfileIndicator('patternGroups', groupName)}
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
        <button class="settings-btn settings-btn-secondary" id="import-patterns-btn">Import from Clipboard</button>
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

  // Build trigger and timer options for action dropdowns
  const triggerOptions = currentTriggers.triggers
    .filter(t => t.name && t.name.trim() !== '')
    .map(t => ({ name: t.name }));
  const timerOptions = currentTimers.timers
    .filter(t => t.name && t.name.trim() !== '')
    .map(t => ({ name: t.name }));

  const triggerCards = currentTriggers.triggers.map((trigger, triggerIndex) => {
    // Build pattern group selection chips
    const patternChips = availableGroups.map(groupName =>
      Chip({
        label: groupName,
        selected: trigger.patternGroups.includes(groupName),
        dataAttr: 'trigger-pattern-group',
        value: `${triggerIndex}:${groupName}`,
      })
    ).join('');

    // Get available capture groups from selected pattern groups
    const availableCaptureGroups = getCaptureGroupsForPatternGroups(trigger.patternGroups);

    // Build condition rows using component
    const conditionRows = (trigger.conditions || []).map((condition, condIndex) =>
      ConditionRow({
        triggerIndex,
        condIndex,
        condition,
        captureOptions: availableCaptureGroups,
        operators: CONDITION_OPERATORS,
      })
    ).join('');

    // Show message if no pattern groups are defined yet
    const patternsMessage = availableGroups.length === 0
      ? SecondaryText('No pattern groups defined. Create patterns in the Patterns tab first.')
      : (patternChips || SecondaryText('Select pattern groups above.'));

    return Card({
      index: triggerIndex,
      dataPrefix: 'trigger',
      name: trigger.name,
      enabled: trigger.enabled,
      showEnabledCheckbox: true,
      showCopyButton: true,
      children: `
        ${Subsection({
          label: 'Patterns',
          description: 'OR logic - any match fires',
          children: ChipContainer({ children: patternsMessage }),
        })}
        ${Subsection({
          label: 'Conditions',
          description: 'optional, AND logic',
          children: ConditionsList({ children: conditionRows }),
          addButton: { label: '+ Add Condition', dataAttr: 'add-trigger-condition', index: triggerIndex },
        })}
        ${ActionList({
          context: 'trigger',
          parentIndex: triggerIndex,
          actions: trigger.actions || [],
          actionTypes: ACTION_TYPES,
          triggerOptions,
          timerOptions,
          captureOptions: availableCaptureGroups,
        })}
        ${buildProfileIndicator('triggers', trigger.name)}
      `,
    });
  }).join('');

  return `
    <div class="settings-section">
      <h3>Trigger Tester</h3>
      <p class="settings-description">Test which triggers would fire for a line of MUD output.</p>
      <div class="settings-pattern-tester">
        <div class="settings-row">
          <input type="text" class="settings-input" id="trigger-test-input"
                 placeholder="Paste MUD output here to test which triggers would fire...">
          <button class="settings-btn settings-btn-secondary" id="trigger-test-btn">Test</button>
        </div>
        <div id="trigger-test-result" class="settings-pattern-test-result"></div>
      </div>
    </div>

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
      <div class="settings-add-group">
        <button class="settings-btn settings-btn-secondary" id="add-trigger-btn">+ Add Trigger</button>
        <button class="settings-btn settings-btn-secondary" id="import-triggers-btn">Import from Clipboard</button>
      </div>
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
        // Determine if input fields need to change
        const wasTriggerType = oldType === 'disable_trigger' || oldType === 'enable_trigger';
        const isTriggerType = newType === 'disable_trigger' || newType === 'enable_trigger';
        const wasTimerType = oldType === 'disable_timer' || oldType === 'enable_timer';
        const isTimerType = newType === 'disable_timer' || newType === 'enable_timer';
        const wasSetVariable = oldType === 'set_variable';
        const isSetVariable = newType === 'set_variable';
        // Re-render when switching between different input layouts
        if (wasTriggerType !== isTriggerType || wasTimerType !== isTimerType || wasSetVariable !== isSetVariable) {
          // Reset fields when changing type
          actions[actionIndex].value = '';
          actions[actionIndex].name = undefined;
          actions[actionIndex].capture = undefined;
          render();
          // Focus the appropriate input after re-render
          if (isSetVariable) {
            const varNameInput = document.querySelector(`[data-trigger-action-var-name="${triggerIndex}:${actionIndex}"]`) as HTMLInputElement;
            if (varNameInput) varNameInput.focus();
          } else {
            const valueInput = document.querySelector(`[data-trigger-action-value="${triggerIndex}:${actionIndex}"]`) as HTMLInputElement | HTMLSelectElement;
            if (valueInput) valueInput.focus();
          }
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

  // set_variable action: variable name input
  document.querySelectorAll('[data-trigger-action-var-name]').forEach((input) => {
    const el = input as HTMLInputElement;
    const [triggerStr, actionStr] = el.dataset.triggerActionVarName!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('input', () => {
      const actions = currentTriggers.triggers[triggerIndex].actions;
      if (actions) actions[actionIndex].name = el.value;
    });
  });

  // set_variable action: capture group select
  document.querySelectorAll('[data-trigger-action-capture]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const [triggerStr, actionStr] = el.dataset.triggerActionCapture!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('change', () => {
      const actions = currentTriggers.triggers[triggerIndex].actions;
      if (actions) actions[actionIndex].capture = el.value;
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

  // Move action up buttons
  document.querySelectorAll('[data-move-trigger-action-up]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [triggerStr, actionStr] = el.dataset.moveTriggerActionUp!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const actions = currentTriggers.triggers[triggerIndex].actions;
      if (actions && actionIndex > 0) {
        [actions[actionIndex - 1], actions[actionIndex]] = [actions[actionIndex], actions[actionIndex - 1]];
        const scrollY = window.scrollY;
        render();
        window.scrollTo(0, scrollY);
      }
    });
  });

  // Move action down buttons
  document.querySelectorAll('[data-move-trigger-action-down]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [triggerStr, actionStr] = el.dataset.moveTriggerActionDown!.split(':');
    const triggerIndex = parseInt(triggerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const actions = currentTriggers.triggers[triggerIndex].actions;
      if (actions && actionIndex < actions.length - 1) {
        [actions[actionIndex], actions[actionIndex + 1]] = [actions[actionIndex + 1], actions[actionIndex]];
        const scrollY = window.scrollY;
        render();
        window.scrollTo(0, scrollY);
      }
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

  // Copy trigger buttons
  document.querySelectorAll('[data-copy-trigger]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const triggerIndex = parseInt(el.dataset.copyTrigger!, 10);
    el.addEventListener('click', () => copyTrigger(triggerIndex));
  });

  // Import triggers from clipboard button
  document.getElementById('import-triggers-btn')?.addEventListener('click', () => {
    importTriggersFromClipboard();
  });

  // Trigger tester
  document.getElementById('trigger-test-btn')?.addEventListener('click', () => {
    const testInput = document.getElementById('trigger-test-input') as HTMLInputElement;
    const resultDiv = document.getElementById('trigger-test-result');

    if (!testInput || !resultDiv) return;

    const testString = testInput.value;
    if (!testString) {
      resultDiv.innerHTML = '<span class="test-error">Please enter a test string</span>';
      return;
    }

    const results: string[] = [];

    for (const trigger of currentTriggers.triggers) {
      if (!trigger.enabled) continue;

      // Resolve patterns from pattern groups
      const patternStrings: string[] = [];
      for (const groupName of trigger.patternGroups) {
        const patterns = currentPatterns.groups[groupName];
        if (patterns) {
          patternStrings.push(...patterns);
        }
      }

      if (patternStrings.length === 0) continue;

      // Test each pattern (OR logic)
      for (const patternStr of patternStrings) {
        try {
          const regex = new RegExp(patternStr);
          const match = regex.exec(testString);

          if (!match) continue;

          // Check conditions (AND logic)
          const conditionResults: { passed: boolean; details: string }[] = [];
          let allConditionsPassed = true;

          if (trigger.conditions && trigger.conditions.length > 0) {
            for (const condition of trigger.conditions) {
              if (!condition.capture || condition.capture.trim() === '') continue;

              const captured = match.groups?.[condition.capture];
              if (captured === undefined) {
                conditionResults.push({
                  passed: false,
                  details: `${condition.capture}: not captured`,
                });
                allConditionsPassed = false;
                continue;
              }

              const passed = evaluateTriggerCondition(captured, condition.operator, condition.value);
              const valueStr = Array.isArray(condition.value)
                ? `[${condition.value.join(', ')}]`
                : String(condition.value);
              conditionResults.push({
                passed,
                details: `${condition.capture} (${captured}) ${condition.operator} ${valueStr}`,
              });
              if (!passed) allConditionsPassed = false;
            }
          }

          // Build result HTML
          const triggerName = trigger.name || '(unnamed)';
          let html = `<div class="test-match-item">
            <div class="test-match-header">
              <span class="${allConditionsPassed ? 'test-success' : 'test-warning'}">${escapeHtml(triggerName)}</span>
              ${allConditionsPassed ? 'would fire' : 'pattern matched but conditions failed'}
            </div>`;

          // Show captured groups
          if (match.groups && Object.keys(match.groups).length > 0) {
            html += '<div class="test-captures-grid">';
            for (const [name, value] of Object.entries(match.groups)) {
              html += `<div class="test-capture"><span class="test-capture-name">${escapeHtml(name)}</span><span class="test-capture-value">${escapeHtml(value || '')}</span></div>`;
            }
            html += '</div>';
          }

          // Show condition results
          if (conditionResults.length > 0) {
            html += '<div class="test-conditions">';
            for (const cond of conditionResults) {
              html += `<div class="test-condition ${cond.passed ? 'passed' : 'failed'}">
                <span class="test-condition-icon">${cond.passed ? '\u2713' : '\u2717'}</span>
                <span class="test-condition-details">${escapeHtml(cond.details)}</span>
              </div>`;
            }
            html += '</div>';
          }

          // Show actions if trigger would fire
          if (allConditionsPassed && trigger.actions && trigger.actions.length > 0) {
            html += '<div class="test-actions"><span class="test-actions-label">Actions:</span>';
            for (const action of trigger.actions) {
              if (action.type === 'set_variable') {
                // set_variable uses name/capture instead of value
                const capturedVal = match.groups?.[action.capture || ''] || '';
                html += `<span class="test-action">set ${escapeHtml(action.name || '')} = ${escapeHtml(capturedVal)}</span>`;
              } else {
                html += `<span class="test-action">${escapeHtml(action.type)}: ${escapeHtml(action.value || '')}</span>`;
              }
            }
            html += '</div>';
          }

          html += '</div>';
          results.push(html);
          break; // One match per trigger is enough (OR logic across patterns)
        } catch {
          // Skip invalid patterns
        }
      }
    }

    if (results.length === 0) {
      resultDiv.innerHTML = '<span class="test-no-match">No triggers would fire</span>';
    } else {
      resultDiv.innerHTML = results.join('');
    }
  });
}

/**
 * Evaluate a trigger condition (mirrors TriggerEngine logic)
 */
function evaluateTriggerCondition(
  captured: string,
  operator: ConditionOperator,
  value: string | number | (string | number)[],
): boolean {
  const toNumber = (val: string | number | (string | number)[]): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    return 0;
  };

  switch (operator) {
    case 'eq':
      return captured === String(value);
    case 'neq':
      return captured !== String(value);
    case 'lt':
      return toNumber(captured) < toNumber(value);
    case 'gt':
      return toNumber(captured) > toNumber(value);
    case 'lte':
      return toNumber(captured) <= toNumber(value);
    case 'gte':
      return toNumber(captured) >= toNumber(value);
    case 'in':
      return Array.isArray(value) && value.map(String).includes(captured);
    case 'not_in':
      return Array.isArray(value) && !value.map(String).includes(captured);
    case 'contains':
      return captured.includes(String(value));
    case 'matches': {
      try {
        return new RegExp(String(value)).test(captured);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function buildTimersSection(): string {
  // Build trigger and timer options for action dropdowns
  const triggerOptions = currentTriggers.triggers
    .filter(t => t.name && t.name.trim() !== '')
    .map(t => ({ name: t.name }));
  const timerOptions = currentTimers.timers
    .filter(t => t.name && t.name.trim() !== '')
    .map(t => ({ name: t.name }));

  const timerCards = currentTimers.timers.map((timer, timerIndex) => {
    return Card({
      index: timerIndex,
      dataPrefix: 'timer',
      name: timer.name,
      enabled: timer.enabled,
      showEnabledCheckbox: true,
      showCopyButton: false,
      children: `
        ${Subsection({
          label: 'Interval',
          children: FormRow({
            children: `
              ${SecondaryText('every')}
              <input type="number" class="settings-input" style="width: 80px"
                     data-timer-interval="${timerIndex}"
                     value="${timer.interval}" min="1" placeholder="60">
              ${SecondaryText('seconds')}
            `,
          }),
        })}
        ${ActionList({
          context: 'timer',
          parentIndex: timerIndex,
          actions: timer.actions || [],
          actionTypes: TIMER_ACTION_TYPES,
          triggerOptions,
          timerOptions,
        })}
        ${buildProfileIndicator('timers', timer.name)}
      `,
    });
  }).join('');

  return `
    <div class="settings-section">
      <h3>About Timers</h3>
      <p class="settings-description">
        Timers execute actions automatically at specified intervals while connected.
      </p>
      <details class="settings-help-details">
        <summary>Timer examples</summary>
        <div class="settings-help-content">
          <ul>
            <li><strong>Auto-save:</strong> 300s interval, action: send <code>save</code></li>
            <li><strong>Keep-alive:</strong> 60s interval, action: send <code>look</code></li>
            <li><strong>Toggle trigger:</strong> Enable/disable triggers on a schedule</li>
          </ul>
        </div>
      </details>
    </div>

    <div class="settings-section">
      <h3>Timers</h3>
      ${timerCards || '<div class="settings-empty"><p>No timers defined.</p></div>'}
    </div>

    <div class="settings-section">
      <div class="settings-add-group">
        <button class="settings-btn settings-btn-secondary" id="add-timer-btn">+ Add Timer</button>
      </div>
    </div>
  `;
}

function bindTimerInputs() {
  // Enable/disable toggles
  document.querySelectorAll('[data-timer-enabled]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.timerEnabled!, 10);
    el.addEventListener('change', () => {
      currentTimers.timers[index].enabled = el.checked;
    });
  });

  // Timer name inputs
  document.querySelectorAll('[data-timer-name]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.timerName!, 10);
    el.addEventListener('change', () => {
      const name = el.value.trim();
      if (name) {
        currentTimers.timers[index].name = name;
      } else {
        el.value = currentTimers.timers[index].name;
      }
    });
  });

  // Timer interval inputs
  document.querySelectorAll('[data-timer-interval]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.timerInterval!, 10);
    el.addEventListener('change', () => {
      const interval = parseInt(el.value, 10);
      if (interval > 0) {
        currentTimers.timers[index].interval = interval;
      } else {
        el.value = String(currentTimers.timers[index].interval);
      }
    });
  });

  // Action type selects
  document.querySelectorAll('[data-timer-action-type]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const [timerStr, actionStr] = el.dataset.timerActionType!.split(':');
    const timerIndex = parseInt(timerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('change', () => {
      const actions = currentTimers.timers[timerIndex].actions;
      if (actions) {
        const oldType = actions[actionIndex].type;
        const newType = el.value as TriggerActionType;
        actions[actionIndex].type = newType;
        // Re-render when switching between different input layouts
        const wasTimerType = oldType === 'disable_timer' || oldType === 'enable_timer';
        const isTimerType = newType === 'disable_timer' || newType === 'enable_timer';
        const wasTriggerType = oldType === 'disable_trigger' || oldType === 'enable_trigger';
        const isTriggerType = newType === 'disable_trigger' || newType === 'enable_trigger';
        if (wasTimerType !== isTimerType || wasTriggerType !== isTriggerType) {
          actions[actionIndex].value = '';
          render();
        }
      }
    });
  });

  // Action value inputs (can be input or select)
  document.querySelectorAll('[data-timer-action-value]').forEach((input) => {
    const el = input as HTMLInputElement | HTMLSelectElement;
    const [timerStr, actionStr] = el.dataset.timerActionValue!.split(':');
    const timerIndex = parseInt(timerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      const actions = currentTimers.timers[timerIndex].actions;
      if (actions) actions[actionIndex].value = el.value;
    });
  });

  // Delete action buttons
  document.querySelectorAll('[data-delete-timer-action]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [timerStr, actionStr] = el.dataset.deleteTimerAction!.split(':');
    const timerIndex = parseInt(timerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('click', () => {
      currentTimers.timers[timerIndex].actions?.splice(actionIndex, 1);
      render();
    });
  });

  // Move action up buttons
  document.querySelectorAll('[data-move-timer-action-up]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [timerStr, actionStr] = el.dataset.moveTimerActionUp!.split(':');
    const timerIndex = parseInt(timerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const actions = currentTimers.timers[timerIndex].actions;
      if (actions && actionIndex > 0) {
        [actions[actionIndex - 1], actions[actionIndex]] = [actions[actionIndex], actions[actionIndex - 1]];
        const scrollY = window.scrollY;
        render();
        window.scrollTo(0, scrollY);
      }
    });
  });

  // Move action down buttons
  document.querySelectorAll('[data-move-timer-action-down]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const [timerStr, actionStr] = el.dataset.moveTimerActionDown!.split(':');
    const timerIndex = parseInt(timerStr, 10);
    const actionIndex = parseInt(actionStr, 10);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const actions = currentTimers.timers[timerIndex].actions;
      if (actions && actionIndex < actions.length - 1) {
        [actions[actionIndex], actions[actionIndex + 1]] = [actions[actionIndex + 1], actions[actionIndex]];
        const scrollY = window.scrollY;
        render();
        window.scrollTo(0, scrollY);
      }
    });
  });

  // Add action buttons
  document.querySelectorAll('[data-add-timer-action]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const timerIndex = parseInt(el.dataset.addTimerAction!, 10);
    el.addEventListener('click', () => {
      const timer = currentTimers.timers[timerIndex];
      if (!timer.actions) timer.actions = [];
      timer.actions.push({ type: 'send', value: '' });
      render();
      // Focus the new action's value input
      const newActionIndex = timer.actions.length - 1;
      const valueInput = document.querySelector(`[data-timer-action-value="${timerIndex}:${newActionIndex}"]`) as HTMLInputElement;
      if (valueInput) valueInput.focus();
    });
  });

  // Delete timer buttons
  document.querySelectorAll('[data-delete-timer]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const timerIndex = parseInt(el.dataset.deleteTimer!, 10);
    el.addEventListener('click', () => {
      currentTimers.timers.splice(timerIndex, 1);
      render();
    });
  });

  // Add timer button
  document.getElementById('add-timer-btn')?.addEventListener('click', () => {
    currentTimers.timers.push({
      name: '',
      enabled: true,
      interval: 60,
      actions: [{ type: 'send', value: '' }],
    });
    render();
    // Focus the new timer's name input
    const newIndex = currentTimers.timers.length - 1;
    const nameInput = document.querySelector(`[data-timer-name="${newIndex}"]`) as HTMLInputElement;
    if (nameInput) {
      nameInput.focus();
      nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function buildGaugesSection(): string {
  // Gather available variable names from set_variable trigger actions
  const availableVariables = new Set<string>();
  for (const trigger of currentTriggers.triggers) {
    for (const action of trigger.actions || []) {
      if (action.type === 'set_variable' && action.name) {
        availableVariables.add(action.name);
      }
    }
  }
  const variableOptions = Array.from(availableVariables).sort();

  const gaugeCards = currentGauges.gauges.map((gauge, gaugeIndex) => {
    // Include current value if not in list (for backwards compat)
    const varOptions = [...variableOptions];
    if (gauge.variable && !varOptions.includes(gauge.variable)) {
      varOptions.unshift(gauge.variable);
    }
    const maxVarOptions = [...variableOptions];
    if (gauge.maxVariable && !maxVarOptions.includes(gauge.maxVariable)) {
      maxVarOptions.unshift(gauge.maxVariable);
    }

    return Card({
      index: gaugeIndex,
      dataPrefix: 'gauge',
      name: gauge.label || '',
      enabled: gauge.enabled !== false,
      showEnabledCheckbox: true,
      showCopyButton: false,
      draggable: true,
      placeholder: 'Label (e.g., HP)',
      children: Subsection({
        label: 'Display',
        children: FormRow({
          children: `
            <select class="settings-select" style="width: 140px" data-gauge-variable="${gaugeIndex}" title="Variable to display">
              <option value="">Select variable...</option>
              ${varOptions.map(v =>
                `<option value="${escapeHtml(v)}"${gauge.variable === v ? ' selected' : ''}>${escapeHtml(v)}</option>`
              ).join('')}
            </select>
            <span class="settings-description" style="padding: 0 4px;">/</span>
            <select class="settings-select" style="width: 140px" data-gauge-max-variable="${gaugeIndex}" title="Max value source">
              <option value=""${!gauge.maxVariable ? ' selected' : ''}>static</option>
              ${maxVarOptions.map(v =>
                `<option value="${escapeHtml(v)}"${gauge.maxVariable === v ? ' selected' : ''}>${escapeHtml(v)}</option>`
              ).join('')}
            </select>
            <input type="number" class="settings-input" style="width: 60px;${gauge.maxVariable ? ' opacity: 0.5' : ''}"
                   data-gauge-max="${gaugeIndex}"
                   value="${gauge.max !== undefined ? gauge.max : 100}" min="1" title="Static max value"
                   ${gauge.maxVariable ? 'disabled' : ''}>
            <input type="color" class="settings-color-swatch" style="width: 32px; height: 24px; margin-left: auto;"
                   data-gauge-color="${gaugeIndex}"
                   value="${gauge.color || '#4caf50'}" title="Gauge color">
          `,
        }),
      }) + (gauge.variable ? buildProfileIndicator('gauges', gauge.variable) : ''),
    });
  }).join('');

  return `
    <div class="settings-section">
      <h3>About Gauges</h3>
      <p class="settings-description">
        Gauges display captured variables (like health, mana, movement) as visual bars in the status line.
        Variables are captured using triggers with the <code>set_variable</code> action.
      </p>
      <details class="settings-help-details">
        <summary>How to set up gauges</summary>
        <div class="settings-help-content">
          <ol>
            <li><strong>Create a pattern</strong> that matches your MUD's prompt with named capture groups:
              <code>&lt;(?&lt;health&gt;\\d+)hp (?&lt;mana&gt;\\d+)mana&gt;</code></li>
            <li><strong>Create triggers</strong> using that pattern with <code>set_variable</code> actions to capture the values</li>
            <li><strong>Add gauges</strong> below to display those variables</li>
          </ol>
        </div>
      </details>
    </div>

    <div class="settings-section">
      <h3>Status Line</h3>
      <p class="settings-description">
        Gauges appear in the center of the status bar at the top of the window once variables are captured.
      </p>
      <div class="settings-row">
        <label class="settings-label">Enable Status Line</label>
        <input type="checkbox" class="settings-checkbox" id="gauges-enabled"
               ${currentGauges.statusLine.enabled ? 'checked' : ''}>
      </div>
    </div>

    <div class="settings-section">
      <h3>Configured Gauges</h3>
      ${gaugeCards || '<div class="settings-empty"><p>No gauges configured. Add a gauge to display a captured variable.</p></div>'}
    </div>

    <div class="settings-section">
      <div class="settings-add-group">
        <button class="settings-btn settings-btn-secondary" id="add-gauge-btn">+ Add Gauge</button>
      </div>
    </div>
  `;
}

function bindGaugeInputs() {
  // Status line enabled toggle
  const enabledToggle = document.getElementById('gauges-enabled') as HTMLInputElement;
  if (enabledToggle) {
    enabledToggle.addEventListener('change', () => {
      currentGauges.statusLine.enabled = enabledToggle.checked;
    });
  }

  // Individual gauge enabled toggles
  document.querySelectorAll('[data-gauge-enabled]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.gaugeEnabled!, 10);
    el.addEventListener('change', () => {
      currentGauges.gauges[index].enabled = el.checked;
    });
  });

  // Gauge variable selects
  document.querySelectorAll('[data-gauge-variable]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const index = parseInt(el.dataset.gaugeVariable!, 10);
    el.addEventListener('change', () => {
      currentGauges.gauges[index].variable = el.value;
    });
  });

  // Gauge label inputs (uses data-gauge-name for consistency with Card component)
  document.querySelectorAll('[data-gauge-name]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.gaugeName!, 10);
    el.addEventListener('change', () => {
      currentGauges.gauges[index].label = el.value.trim();
    });
  });

  // Gauge maxVariable selects
  document.querySelectorAll('[data-gauge-max-variable]').forEach((input) => {
    const el = input as HTMLSelectElement;
    const index = parseInt(el.dataset.gaugeMaxVariable!, 10);
    el.addEventListener('change', () => {
      const value = el.value;
      const maxInput = document.querySelector(`[data-gauge-max="${index}"]`) as HTMLInputElement;
      if (value) {
        currentGauges.gauges[index].maxVariable = value;
        // Disable static max input when using variable
        if (maxInput) {
          maxInput.disabled = true;
          maxInput.style.opacity = '0.5';
        }
      } else {
        currentGauges.gauges[index].maxVariable = undefined;
        // Enable static max input when using static
        if (maxInput) {
          maxInput.disabled = false;
          maxInput.style.opacity = '1';
          // Set default if empty
          if (!maxInput.value) maxInput.value = '100';
          currentGauges.gauges[index].max = parseInt(maxInput.value, 10) || 100;
        }
      }
    });
  });

  // Gauge static max inputs
  document.querySelectorAll('[data-gauge-max]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.gaugeMax!, 10);
    el.addEventListener('change', () => {
      // Only update if not using a max variable
      if (!currentGauges.gauges[index].maxVariable) {
        const value = parseInt(el.value, 10);
        if (!isNaN(value) && value > 0) {
          currentGauges.gauges[index].max = value;
        }
      }
    });
  });

  // Gauge color inputs
  document.querySelectorAll('[data-gauge-color]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.gaugeColor!, 10);
    el.addEventListener('change', () => {
      currentGauges.gauges[index].color = el.value;
    });
  });

  // Gauge width inputs
  document.querySelectorAll('[data-gauge-width]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.gaugeWidth!, 10);
    el.addEventListener('change', () => {
      const value = parseInt(el.value, 10);
      if (!isNaN(value) && value >= 5 && value <= 50) {
        currentGauges.gauges[index].width = value;
      }
    });
  });

  // Delete gauge buttons
  document.querySelectorAll('[data-delete-gauge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.deleteGauge!, 10);
      currentGauges.gauges.splice(index, 1);
      render();
    });
  });

  // Add gauge button
  document.getElementById('add-gauge-btn')?.addEventListener('click', () => {
    currentGauges.gauges.push({
      variable: '',
      label: '',
      width: 10,
    });
    render();
    // Focus the new gauge's label input
    const newIndex = currentGauges.gauges.length - 1;
    const labelInput = document.querySelector(`[data-gauge-label="${newIndex}"]`) as HTMLInputElement;
    if (labelInput) {
      labelInput.focus();
      labelInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Reorder gauges with up/down buttons
  document.querySelectorAll('[data-move-up-gauge]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const index = parseInt(el.dataset.moveUpGauge!, 10);
    el.addEventListener('click', () => {
      if (index > 0) {
        const gauges = currentGauges.gauges;
        [gauges[index - 1], gauges[index]] = [gauges[index], gauges[index - 1]];
        render();
      }
    });
  });

  document.querySelectorAll('[data-move-down-gauge]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const index = parseInt(el.dataset.moveDownGauge!, 10);
    el.addEventListener('click', () => {
      const gauges = currentGauges.gauges;
      if (index < gauges.length - 1) {
        [gauges[index], gauges[index + 1]] = [gauges[index + 1], gauges[index]];
        render();
      }
    });
  });
}

/**
 * Build the Characters section - displays connections and characters with profile assignment
 */
function buildCharactersSection(): string {
  // If editing a character, show the editor
  if (editingCharacter) {
    return buildCharacterEditorSection(editingCharacter.connectionId, editingCharacter.characterId);
  }

  const connectionCards = connectionsWithCharacters.map(({ connection, characters }) => {
    const characterRows = characters.map(char => {
      const profile = char.profileId
        ? currentProfiles.profiles.find(p => p.id === char.profileId)
        : null;
      const profileName = profile ? profile.name : 'Global (all items)';

      return `
        <div class="settings-character-row" data-character="${connection.id}:${char.id}">
          <div class="settings-character-info">
            <span class="settings-character-name">${escapeHtml(char.name)}</span>
            <span class="settings-character-profile">${escapeHtml(profileName)}</span>
          </div>
          <div class="settings-character-meta">
            <span class="settings-character-last-used">${formatLastUsed(char.lastUsedAt)}</span>
            <button type="button" class="settings-btn settings-btn-secondary settings-btn-small" data-edit-character="${connection.id}:${char.id}">Edit</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="settings-connection-card">
        <div class="settings-connection-header">
          <span class="settings-connection-name">${escapeHtml(connection.name)}</span>
          <span class="settings-connection-host">${escapeHtml(connection.host)}:${connection.port}</span>
        </div>
        <div class="settings-character-list">
          ${characterRows || '<div class="settings-empty-small">No characters yet</div>'}
        </div>
        <div class="settings-card-footer">
          <input type="text" class="settings-input" placeholder="Character name" data-add-char-name="${connection.id}">
          <input type="password" class="settings-input" placeholder="Password (optional)" data-add-char-pass="${connection.id}">
          <button type="button" class="settings-btn settings-btn-secondary" data-add-char-btn="${connection.id}">Add</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section">
      <h3>Add Connection</h3>
      <p class="settings-description">
        Add a new MUD server connection.
      </p>
      <div class="settings-card-footer">
        <input type="text" class="settings-input" id="new-conn-name" placeholder="Name (e.g., My MUD)">
        <input type="text" class="settings-input" id="new-conn-host" placeholder="Host (e.g., mud.example.com)">
        <input type="number" class="settings-input" id="new-conn-port" placeholder="Port" value="23" style="max-width: 80px">
        <button type="button" class="settings-btn settings-btn-primary" id="add-connection-btn">Add</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Connections & Characters</h3>
      ${connectionsWithCharacters.length === 0
        ? '<div class="settings-empty"><p>No connections yet. Add one above to get started.</p></div>'
        : `<div class="settings-connections-list">${connectionCards}</div>`
      }
    </div>
  `;
}

/**
 * Build the Character Editor section
 */
function buildCharacterEditorSection(connectionId: string, characterId: string): string {
  const connData = connectionsWithCharacters.find(c => c.connection.id === connectionId);
  if (!connData) {
    editingCharacter = null;
    return buildCharactersSection();
  }

  const character = connData.characters.find(c => c.id === characterId);
  if (!character) {
    editingCharacter = null;
    return buildCharactersSection();
  }

  // Build profile options
  const profileOptions = [
    `<option value=""${!character.profileId ? ' selected' : ''}>Global (all items active)</option>`,
    ...currentProfiles.profiles.map(p =>
      `<option value="${escapeHtml(p.id)}"${character.profileId === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
    )
  ].join('');

  return `
    <div class="settings-section">
      <div class="settings-profile-editor-header">
        <button class="settings-btn settings-btn-secondary" id="character-back-btn">&larr; Back to Characters</button>
        <h3>Editing: ${escapeHtml(character.name)}</h3>
      </div>
    </div>

    <div class="settings-section">
      <h3>Character Details</h3>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label">Connection</label>
          <span class="settings-description">${escapeHtml(connData.connection.name)} (${escapeHtml(connData.connection.host)}:${connData.connection.port})</span>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="character-edit-name">Name</label>
        </div>
        <input type="text" class="settings-input" id="character-edit-name"
               value="${escapeHtml(character.name)}" placeholder="Character name">
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="character-edit-password">Password</label>
          <span class="settings-description">Used for auto-login</span>
        </div>
        <input type="password" class="settings-input" id="character-edit-password"
               value="${escapeHtml(character.password || '')}" placeholder="Optional">
      </div>
    </div>

    <div class="settings-section">
      <h3>Profile Assignment</h3>
      <p class="settings-description">
        Assign a profile to limit which triggers, aliases, timers, and other items are active for this character.
        Leave as "Global" to use all items.
      </p>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="character-edit-profile">Profile</label>
        </div>
        <select class="settings-select" id="character-edit-profile" style="width: 200px">
          ${profileOptions}
        </select>
      </div>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label" for="character-edit-colorscheme">Color Scheme</label>
          <span class="settings-description">Terminal color scheme for this character</span>
        </div>
        <select class="settings-select" id="character-edit-colorscheme" style="width: 200px">
          ${COLOR_SCHEME_OPTIONS.map(opt =>
            `<option value="${opt.value}"${(character.colorScheme || 'dark') === opt.value ? ' selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-character-stats">
        <span class="settings-description">Created: ${new Date(character.createdAt).toLocaleDateString()}</span>
        <span class="settings-description">Last used: ${formatLastUsed(character.lastUsedAt)}</span>
      </div>
    </div>

    <div class="settings-section settings-danger-zone">
      <h3>Danger Zone</h3>
      <div class="settings-row">
        <div class="settings-label-group">
          <label class="settings-label">Delete Character</label>
          <span class="settings-description">Permanently delete this character and its command history.</span>
        </div>
        <button type="button" class="settings-btn settings-btn-danger" id="character-delete-btn">Delete Character</button>
      </div>
    </div>
  `;
}

/**
 * Bind event handlers for the Characters section
 */
function bindCharacterInputs() {
  // Add connection button
  const addConnBtn = document.getElementById('add-connection-btn');
  if (addConnBtn) {
    addConnBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-conn-name') as HTMLInputElement;
      const hostInput = document.getElementById('new-conn-host') as HTMLInputElement;
      const portInput = document.getElementById('new-conn-port') as HTMLInputElement;

      const name = nameInput?.value.trim();
      const host = hostInput?.value.trim();
      const port = parseInt(portInput?.value || '23', 10);

      if (!name || !host) {
        return;
      }

      try {
        const connection = await createConnection(name, host, port);
        connectionsWithCharacters.push({ connection, characters: [] });
        render();
      } catch (error) {
        console.error('Failed to create connection:', error);
      }
    });
  }

  // Add character buttons
  document.querySelectorAll('[data-add-char-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const connectionId = (btn as HTMLElement).dataset.addCharBtn;
      if (!connectionId) return;

      const nameInput = document.querySelector(`[data-add-char-name="${connectionId}"]`) as HTMLInputElement;
      const passInput = document.querySelector(`[data-add-char-pass="${connectionId}"]`) as HTMLInputElement;

      const name = nameInput?.value.trim();
      const password = passInput?.value || undefined;

      if (!name) return;

      try {
        const character = await createCharacter(connectionId, name, password);
        const connData = connectionsWithCharacters.find(c => c.connection.id === connectionId);
        if (connData) {
          connData.characters.push(character);
        }
        render();
      } catch (error) {
        console.error('Failed to create character:', error);
      }
    });
  });

  // Edit character buttons
  document.querySelectorAll('[data-edit-character]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [connectionId, characterId] = ((btn as HTMLElement).dataset.editCharacter || '').split(':');
      if (connectionId && characterId) {
        editingCharacter = { connectionId, characterId };
        render();
      }
    });
  });

  // Back button (in editor view)
  document.getElementById('character-back-btn')?.addEventListener('click', () => {
    editingCharacter = null;
    render();
  });

  // Character name input
  const nameInput = document.getElementById('character-edit-name') as HTMLInputElement;
  if (nameInput && editingCharacter) {
    nameInput.addEventListener('change', async () => {
      const name = nameInput.value.trim();
      if (!name || !editingCharacter) return;

      const connData = connectionsWithCharacters.find(c => c.connection.id === editingCharacter!.connectionId);
      const character = connData?.characters.find(c => c.id === editingCharacter!.characterId);
      if (character) {
        character.name = name;
        await saveCharacter(character);
      }
    });
  }

  // Character password input
  const passwordInput = document.getElementById('character-edit-password') as HTMLInputElement;
  if (passwordInput && editingCharacter) {
    passwordInput.addEventListener('change', async () => {
      if (!editingCharacter) return;

      const connData = connectionsWithCharacters.find(c => c.connection.id === editingCharacter!.connectionId);
      const character = connData?.characters.find(c => c.id === editingCharacter!.characterId);
      if (character) {
        character.password = passwordInput.value || undefined;
        await saveCharacter(character);
      }
    });
  }

  // Character profile select
  const profileSelect = document.getElementById('character-edit-profile') as HTMLSelectElement;
  if (profileSelect && editingCharacter) {
    profileSelect.addEventListener('change', async () => {
      if (!editingCharacter) return;

      const connData = connectionsWithCharacters.find(c => c.connection.id === editingCharacter!.connectionId);
      const character = connData?.characters.find(c => c.id === editingCharacter!.characterId);
      if (character) {
        character.profileId = profileSelect.value || undefined;
        await saveCharacter(character);
      }
    });
  }

  // Character color scheme select
  const colorSchemeSelect = document.getElementById('character-edit-colorscheme') as HTMLSelectElement;
  if (colorSchemeSelect && editingCharacter) {
    colorSchemeSelect.addEventListener('change', async () => {
      if (!editingCharacter) return;

      const connData = connectionsWithCharacters.find(c => c.connection.id === editingCharacter!.connectionId);
      const character = connData?.characters.find(c => c.id === editingCharacter!.characterId);
      if (character) {
        const newScheme = (colorSchemeSelect.value as ColorSchemeName) || 'dark';
        character.colorScheme = newScheme;
        await saveCharacter(character);
        // Emit event to apply the color scheme immediately to any connected windows
        emit('character-colorscheme-changed', {
          characterId: character.id,
          connectionId: character.connectionId,
          colorScheme: newScheme,
        });
      }
    });
  }

  // Delete character button
  const deleteBtn = document.getElementById('character-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!editingCharacter) return;

      const connData = connectionsWithCharacters.find(c => c.connection.id === editingCharacter!.connectionId);
      const character = connData?.characters.find(c => c.id === editingCharacter!.characterId);
      if (!character) return;

      // Two-click confirmation: first click shows confirm state, second click deletes
      if (deleteBtn.dataset.confirmDelete === 'true') {
        try {
          await deleteCharacter(editingCharacter.connectionId, editingCharacter.characterId);

          // Remove from local state
          if (connData) {
            connData.characters = connData.characters.filter(c => c.id !== editingCharacter!.characterId);
          }

          editingCharacter = null;
          render();
        } catch (error) {
          console.error('Failed to delete character:', error);
          deleteBtn.textContent = 'Delete Failed';
          deleteBtn.dataset.confirmDelete = '';
        }
      } else {
        // First click - show confirmation state
        deleteBtn.dataset.confirmDelete = 'true';
        deleteBtn.textContent = `Click to confirm delete "${character.name}"`;
        deleteBtn.classList.add('settings-btn-danger-confirm');

        // Reset after 3 seconds if not confirmed
        setTimeout(() => {
          if (deleteBtn.dataset.confirmDelete === 'true') {
            deleteBtn.dataset.confirmDelete = '';
            deleteBtn.textContent = 'Delete Character';
            deleteBtn.classList.remove('settings-btn-danger-confirm');
          }
        }, 3000);
      }
    });
  }
}

/**
 * Build the Profiles section
 */
function buildProfilesSection(): string {
  // If editing a profile, show the editor view
  if (editingProfileIndex !== null) {
    return buildProfileEditorSection(editingProfileIndex);
  }

  // Otherwise show the list view
  const profileCards = currentProfiles.profiles.map((profile, index) => {
    // Count how many items are included
    const triggerCount = profile.triggers === undefined ? 'all' : profile.triggers.length.toString();
    const aliasCount = profile.aliases === undefined ? 'all' : profile.aliases.length.toString();
    const timerCount = profile.timers === undefined ? 'all' : profile.timers.length.toString();
    const patternGroupCount = profile.patternGroups === undefined ? 'all' : profile.patternGroups.length.toString();
    const paneCount = profile.panes === undefined ? 'all' : profile.panes.length.toString();
    const gaugeCount = profile.gauges === undefined ? 'all' : profile.gauges.length.toString();

    return `
      <div class="settings-pattern-group-card" data-profile-index="${index}">
        <div class="settings-pattern-group-header">
          <input type="text" class="settings-input settings-group-name-input"
                 data-profile-name="${index}"
                 value="${escapeHtml(profile.name)}" placeholder="Profile name">
          <button class="settings-btn settings-btn-secondary" data-edit-profile="${index}" title="Edit profile">Edit</button>
          <button class="settings-btn settings-btn-secondary" data-duplicate-profile="${index}" title="Duplicate profile">Clone</button>
          <button class="settings-btn settings-btn-icon" data-delete-profile="${index}" title="Delete profile">\u00d7</button>
        </div>
        <div class="settings-profile-details">
          ${profile.description ? `<p class="settings-description">${escapeHtml(profile.description)}</p>` : ''}
          <div class="settings-profile-counts">
            <span class="settings-chip">Triggers: ${triggerCount}</span>
            <span class="settings-chip">Aliases: ${aliasCount}</span>
            <span class="settings-chip">Timers: ${timerCount}</span>
            <span class="settings-chip">Patterns: ${patternGroupCount}</span>
            <span class="settings-chip">Panes: ${paneCount}</span>
            <span class="settings-chip">Gauges: ${gaugeCount}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section">
      <h3>About Profiles</h3>
      <p class="settings-description">
        Profiles let you select which triggers, aliases, timers, patterns, panes, and gauges are active
        for a given character. Assign a profile to a character in the connection menu.
      </p>
      <details class="settings-help-details">
        <summary>How profiles work</summary>
        <div class="settings-help-content">
          <ul>
            <li><strong>Global Pool:</strong> All items (triggers, aliases, etc.) are defined globally in their respective tabs</li>
            <li><strong>Profiles:</strong> A profile selects which items from the global pool are active</li>
            <li><strong>Characters:</strong> A character can be "global" (all items active) or assigned to a profile</li>
            <li><strong>Selection:</strong> In the profile editor, check which items to include. Unchecked items won't fire/work for characters using that profile.</li>
          </ul>
        </div>
      </details>
    </div>

    <div class="settings-section">
      <h3>Profiles</h3>
      ${profileCards || '<div class="settings-empty"><p>No profiles defined. Create a profile to manage which items are active per character.</p></div>'}
    </div>

    <div class="settings-section">
      <div class="settings-add-group">
        <button class="settings-btn settings-btn-secondary" id="add-profile-btn">+ Create Profile</button>
      </div>
    </div>
  `;
}

/**
 * Build the Profile Editor section for a specific profile
 */
function buildProfileEditorSection(profileIndex: number): string {
  const profile = currentProfiles.profiles[profileIndex];
  if (!profile) {
    editingProfileIndex = null;
    return buildProfilesSection();
  }

  // Get all available items from the global pools
  const allTriggers = currentTriggers.triggers.filter(t => t.name && t.name.trim() !== '');
  const allAliases = Object.keys(currentAliases).sort();
  const allTimers = currentTimers.timers.filter(t => t.name && t.name.trim() !== '');
  const allPatternGroups = Object.keys(currentPatterns.groups).sort();
  const allPanes = (currentPanesConfig?.panes || []).filter(p => p.id && p.id.trim() !== '');
  const allGauges = currentGauges.gauges.filter(g => g.variable && g.variable.trim() !== '');

  // Helper to build checkbox lists
  const buildCheckboxList = (
    itemType: 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges',
    items: { name: string; label?: string }[],
    selectedItems: string[] | undefined
  ): string => {
    const isAllSelected = selectedItems === undefined;
    const selectedSet = new Set(selectedItems || []);

    if (items.length === 0) {
      return '<p class="settings-description">No items defined.</p>';
    }

    const checkboxes = items.map((item, i) => {
      const name = item.name;
      const label = item.label || name;
      const isChecked = isAllSelected || selectedSet.has(name);
      return `
        <label class="settings-profile-item">
          <input type="checkbox" class="settings-checkbox"
                 data-profile-item="${itemType}:${escapeHtml(name)}"
                 ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    }).join('');

    return `
      <div class="settings-profile-select-all">
        <label>
          <input type="checkbox" class="settings-checkbox" data-profile-select-all="${itemType}"
                 ${isAllSelected ? 'checked' : ''}>
          <span>Include all (current and future)</span>
        </label>
      </div>
      <div class="settings-profile-items ${isAllSelected ? 'settings-profile-items-disabled' : ''}">
        ${checkboxes}
      </div>
    `;
  };

  return `
    <div class="settings-section">
      <div class="settings-profile-editor-header">
        <button class="settings-btn settings-btn-secondary" id="profile-back-btn">&larr; Back to Profiles</button>
        <h3>Editing: ${escapeHtml(profile.name)}</h3>
      </div>
    </div>

    <div class="settings-section">
      <h3>Profile Details</h3>
      <div class="settings-row">
        <label class="settings-label" for="profile-edit-name">Name</label>
        <input type="text" class="settings-input" id="profile-edit-name"
               value="${escapeHtml(profile.name)}" placeholder="Profile name">
      </div>
      <div class="settings-row">
        <label class="settings-label" for="profile-edit-description">Description</label>
        <input type="text" class="settings-input" id="profile-edit-description"
               value="${escapeHtml(profile.description || '')}" placeholder="Optional description">
      </div>
    </div>

    <div class="settings-section">
      <h3>Included Triggers</h3>
      ${buildCheckboxList('triggers', allTriggers.map(t => ({ name: t.name, label: t.name })), profile.triggers)}
    </div>

    <div class="settings-section">
      <h3>Included Aliases</h3>
      ${buildCheckboxList('aliases', allAliases.map(a => ({ name: a, label: `${a} \u2192 ${currentAliases[a]}` })), profile.aliases)}
    </div>

    <div class="settings-section">
      <h3>Included Timers</h3>
      ${buildCheckboxList('timers', allTimers.map(t => ({ name: t.name, label: t.name })), profile.timers)}
    </div>

    <div class="settings-section">
      <h3>Included Pattern Groups</h3>
      ${buildCheckboxList('patternGroups', allPatternGroups.map(g => ({ name: g, label: g })), profile.patternGroups)}
    </div>

    <div class="settings-section">
      <h3>Included Panes</h3>
      ${buildCheckboxList('panes', allPanes.map(p => ({ name: p.id, label: p.id })), profile.panes)}
    </div>

    <div class="settings-section">
      <h3>Included Gauges</h3>
      ${buildCheckboxList('gauges', allGauges.map(g => ({ name: g.variable, label: g.label || g.variable })), profile.gauges)}
    </div>
  `;
}

/**
 * Bind event handlers for the Profiles section
 */
function bindProfileInputs() {
  // Profile name inputs (in list view)
  document.querySelectorAll('[data-profile-name]').forEach((input) => {
    const el = input as HTMLInputElement;
    const index = parseInt(el.dataset.profileName!, 10);
    el.addEventListener('change', () => {
      const name = el.value.trim();
      if (name) {
        currentProfiles.profiles[index].name = name;
        currentProfiles.profiles[index].updatedAt = Date.now();
      } else {
        el.value = currentProfiles.profiles[index].name;
      }
    });
  });

  // Edit profile buttons
  document.querySelectorAll('[data-edit-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.editProfile!, 10);
      editingProfileIndex = index;
      render();
    });
  });

  // Duplicate profile buttons
  document.querySelectorAll('[data-duplicate-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.duplicateProfile!, 10);
      const original = currentProfiles.profiles[index];
      if (original) {
        duplicateProfile(currentProfiles, original.id);
        render();
      }
    });
  });

  // Delete profile buttons
  document.querySelectorAll('[data-delete-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.deleteProfile!, 10);
      currentProfiles.profiles.splice(index, 1);
      render();
    });
  });

  // Add profile button
  document.getElementById('add-profile-btn')?.addEventListener('click', () => {
    createProfile(currentProfiles, 'New Profile');
    render();
  });

  // Back button (in editor view)
  document.getElementById('profile-back-btn')?.addEventListener('click', () => {
    editingProfileIndex = null;
    render();
  });

  // Profile name in editor
  const editNameInput = document.getElementById('profile-edit-name') as HTMLInputElement;
  if (editNameInput && editingProfileIndex !== null) {
    editNameInput.addEventListener('change', () => {
      const name = editNameInput.value.trim();
      if (name && editingProfileIndex !== null) {
        currentProfiles.profiles[editingProfileIndex].name = name;
        currentProfiles.profiles[editingProfileIndex].updatedAt = Date.now();
      }
    });
  }

  // Profile description in editor
  const editDescInput = document.getElementById('profile-edit-description') as HTMLInputElement;
  if (editDescInput && editingProfileIndex !== null) {
    editDescInput.addEventListener('change', () => {
      if (editingProfileIndex !== null) {
        currentProfiles.profiles[editingProfileIndex].description = editDescInput.value.trim() || undefined;
        currentProfiles.profiles[editingProfileIndex].updatedAt = Date.now();
      }
    });
  }

  // "Select all" checkboxes
  document.querySelectorAll('[data-profile-select-all]').forEach((input) => {
    const el = input as HTMLInputElement;
    const itemType = el.dataset.profileSelectAll as 'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges';
    el.addEventListener('change', () => {
      if (editingProfileIndex === null) return;
      const profile = currentProfiles.profiles[editingProfileIndex];
      if (el.checked) {
        // Set to undefined = include all
        profile[itemType] = undefined;
      } else {
        // Set to empty array = include none (user will check individual items)
        profile[itemType] = [];
      }
      profile.updatedAt = Date.now();
      render();
    });
  });

  // Individual item checkboxes
  document.querySelectorAll('[data-profile-item]').forEach((input) => {
    const el = input as HTMLInputElement;
    const [itemType, itemName] = el.dataset.profileItem!.split(':') as [
      'triggers' | 'aliases' | 'timers' | 'patternGroups' | 'panes' | 'gauges',
      string
    ];
    el.addEventListener('change', () => {
      if (editingProfileIndex === null) return;
      const profile = currentProfiles.profiles[editingProfileIndex];

      // If currently "all", we need to switch to explicit list first
      if (profile[itemType] === undefined) {
        // This shouldn't happen if UI is correct (items disabled when all selected)
        return;
      }

      const arr = profile[itemType]!;
      if (el.checked) {
        if (!arr.includes(itemName)) {
          arr.push(itemName);
        }
      } else {
        const idx = arr.indexOf(itemName);
        if (idx !== -1) {
          arr.splice(idx, 1);
        }
      }
      profile.updatedAt = Date.now();
    });
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

      <div class="settings-row" style="margin-bottom: 16px">
        <div class="settings-label-group">
          <label class="settings-label" for="color-scheme-preset">Preset</label>
          <span class="settings-description">Select a color scheme or customize below</span>
        </div>
        <select class="settings-select" id="color-scheme-preset" style="width: 150px">
          <option value="">Custom</option>
          ${COLOR_SCHEME_OPTIONS.map(opt =>
            `<option value="${opt.value}">${opt.label}</option>`
          ).join('')}
        </select>
      </div>

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
      // Reset preset dropdown to "Custom" when manually editing colors
      const presetSelect = document.getElementById('color-scheme-preset') as HTMLSelectElement;
      if (presetSelect) presetSelect.value = '';
      emitSettingsChange();
    });
  });

  // Color scheme preset selector
  const colorSchemePreset = document.getElementById('color-scheme-preset') as HTMLSelectElement;
  if (colorSchemePreset) {
    colorSchemePreset.addEventListener('change', () => {
      const schemeName = colorSchemePreset.value as ColorSchemeName;
      if (!schemeName) return; // "Custom" selected, do nothing

      const scheme = getColorScheme(schemeName);
      // Apply all colors from the scheme
      currentSettings.theme = { ...scheme.theme };

      // Update all color swatch inputs to reflect the new values
      const swatches = document.querySelectorAll('[data-theme-color]');
      swatches.forEach((input) => {
        const el = input as HTMLInputElement;
        const colorKey = el.dataset.themeColor as keyof TerminalTheme;
        el.value = currentSettings.theme[colorKey];
      });

      emitSettingsChange();
    });
  }

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

  // Timer inputs (timers tab)
  bindTimerInputs();

  // Gauge inputs (gauges tab)
  bindGaugeInputs();

  // Profile inputs (profiles tab)
  bindProfileInputs();

  // Character inputs (characters tab)
  bindCharacterInputs();
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

  // Copy pattern group buttons
  document.querySelectorAll('[data-copy-pattern-group]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const groupName = el.dataset.copyPatternGroup!;
    el.addEventListener('click', () => copyPatternGroup(groupName));
  });

  // Import patterns from clipboard button
  document.getElementById('import-patterns-btn')?.addEventListener('click', () => {
    importPatternsFromClipboard();
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
      saveTimersConfig(currentTimers),
      saveGaugesConfig(currentGauges),
      saveProfilesConfig(currentProfiles),
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
    await emitTimersConfigChange();
    await emitGaugesConfigChange();
    await emitProfilesConfigChange();
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

async function emitTimersConfigChange() {
  await emit('timers-config-changed', currentTimers);
}

async function emitGaugesConfigChange() {
  await emit('gauges-config-changed', currentGauges);
}

async function emitProfilesConfigChange() {
  await emit('profiles-config-changed', currentProfiles);
}

// Handle Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    emit('settings-changed', originalSettings);
    getCurrentWindow().close();
  }
});

init();
