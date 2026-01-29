/**
 * ActionRow component - A single action row with type dropdown and value input
 */

import type { ActionRowProps, TriggerAction } from './types';
import { escapeHtml } from './helpers';

/**
 * Determine the placeholder text for an action's value input
 */
function getPlaceholder(action: TriggerAction): string {
  if (action.type === 'send') return 'command to send';
  if (action.type === 'notify') return 'notification message';
  return '';
}

/**
 * Build the value input HTML based on action type
 */
function buildValueInput(
  context: 'trigger' | 'timer',
  parentIndex: number,
  actionIndex: number,
  action: TriggerAction,
  triggerOptions: Array<{ name: string }>,
  timerOptions: Array<{ name: string }>,
  captureOptions: string[]
): string {
  const dataAttrPrefix = context === 'trigger' ? 'trigger' : 'timer';
  const isTriggerAction = action.type === 'disable_trigger' || action.type === 'enable_trigger';
  const isTimerAction = action.type === 'disable_timer' || action.type === 'enable_timer';
  const isSetVariable = action.type === 'set_variable';

  if (isSetVariable) {
    // set_variable needs: name (variable), capture (group name)
    // Build capture options - include current value if not in list (for backwards compat)
    const captureOpts = [...captureOptions];
    if (action.capture && !captureOpts.includes(action.capture)) {
      captureOpts.unshift(action.capture);
    }

    return `
      <input type="text" class="settings-input" style="width: 100px"
             data-${dataAttrPrefix}-action-var-name="${parentIndex}:${actionIndex}"
             value="${escapeHtml(action.name || '')}" placeholder="var name" title="Variable name to set">
      <span class="settings-description">=</span>
      <select class="settings-select" style="width: 130px"
              data-${dataAttrPrefix}-action-capture="${parentIndex}:${actionIndex}" title="Named capture group">
        <option value="">Select capture...</option>
        ${captureOpts.map(cap =>
          `<option value="${escapeHtml(cap)}"${action.capture === cap ? ' selected' : ''}>${escapeHtml(cap)}</option>`
        ).join('')}
      </select>`;
  }

  if (isTriggerAction) {
    return `
      <select class="settings-select settings-trigger-action-value"
              data-${dataAttrPrefix}-action-value="${parentIndex}:${actionIndex}">
        <option value="">Select trigger...</option>
        ${triggerOptions.map(t =>
          `<option value="${escapeHtml(t.name)}"${action.value === t.name ? ' selected' : ''}>${escapeHtml(t.name)}</option>`
        ).join('')}
      </select>`;
  }

  if (isTimerAction) {
    return `
      <select class="settings-select settings-trigger-action-value"
              data-${dataAttrPrefix}-action-value="${parentIndex}:${actionIndex}">
        <option value="">Select timer...</option>
        ${timerOptions.map(t =>
          `<option value="${escapeHtml(t.name)}"${action.value === t.name ? ' selected' : ''}>${escapeHtml(t.name)}</option>`
        ).join('')}
      </select>`;
  }

  // Default: text input
  return `
    <input type="text" class="settings-input settings-trigger-action-value"
           data-${dataAttrPrefix}-action-value="${parentIndex}:${actionIndex}"
           value="${escapeHtml(action.value || '')}" placeholder="${getPlaceholder(action)}">`;
}

/**
 * Render an action row with type dropdown and value input
 */
export function ActionRow({
  context,
  parentIndex,
  actionIndex,
  action,
  actionTypes,
  triggerOptions = [],
  timerOptions = [],
  captureOptions = [],
}: ActionRowProps): string {
  const dataAttrPrefix = context === 'trigger' ? 'trigger' : 'timer';

  const valueInput = buildValueInput(
    context,
    parentIndex,
    actionIndex,
    action,
    triggerOptions,
    timerOptions,
    captureOptions
  );

  return `
    <div class="settings-trigger-action-row" data-${dataAttrPrefix}-action="${parentIndex}:${actionIndex}">
      <select class="settings-select settings-trigger-action-type"
              data-${dataAttrPrefix}-action-type="${parentIndex}:${actionIndex}">
        ${actionTypes.map(at =>
          `<option value="${escapeHtml(at.value)}"${action.type === at.value ? ' selected' : ''}>${escapeHtml(at.label)}</option>`
        ).join('')}
      </select>
      ${valueInput}
      <button class="settings-btn settings-btn-icon" data-delete-${dataAttrPrefix}-action="${parentIndex}:${actionIndex}" title="Delete action">\u00d7</button>
    </div>
  `;
}
