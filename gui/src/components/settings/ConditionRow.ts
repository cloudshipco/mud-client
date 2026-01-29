/**
 * ConditionRow component - A single condition row (triggers only)
 */

import type { ConditionRowProps } from './types';
import { escapeHtml } from './helpers';

/**
 * Format a condition value as a string for display
 */
function formatConditionValue(value: string | number | (string | number)[]): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value ?? '');
}

/**
 * Render a condition row with capture dropdown, operator dropdown, value input, and delete button
 */
export function ConditionRow({
  triggerIndex,
  condIndex,
  condition,
  captureOptions,
  operators,
}: ConditionRowProps): string {
  const valueStr = formatConditionValue(condition.value);

  // Include current capture value if not in list (for backwards compat)
  const captureOpts = [...captureOptions];
  if (condition.capture && !captureOpts.includes(condition.capture)) {
    captureOpts.unshift(condition.capture);
  }

  return `
    <div class="settings-trigger-condition-row" data-trigger-condition="${triggerIndex}:${condIndex}">
      <select class="settings-select settings-trigger-condition-capture"
              data-trigger-cond-capture="${triggerIndex}:${condIndex}">
        <option value="">Select capture...</option>
        ${captureOpts.map(cap =>
          `<option value="${escapeHtml(cap)}"${condition.capture === cap ? ' selected' : ''}>${escapeHtml(cap)}</option>`
        ).join('')}
      </select>
      <select class="settings-select settings-trigger-condition-operator"
              data-trigger-cond-operator="${triggerIndex}:${condIndex}">
        ${operators.map(op =>
          `<option value="${escapeHtml(op.value)}"${condition.operator === op.value ? ' selected' : ''}>${escapeHtml(op.label)}</option>`
        ).join('')}
      </select>
      <input type="text" class="settings-input settings-trigger-condition-value"
             data-trigger-cond-value="${triggerIndex}:${condIndex}"
             value="${escapeHtml(valueStr)}" placeholder="value or a, b, c">
      <button class="settings-btn settings-btn-icon" data-delete-trigger-condition="${triggerIndex}:${condIndex}" title="Delete condition">\u00d7</button>
    </div>
  `;
}
