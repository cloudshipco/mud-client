/**
 * Card component - The outer container for triggers, timers, gauges, pattern groups
 */

import type { CardProps } from './types';
import { escapeHtml } from './helpers';

/**
 * Capitalize the first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Render a settings card with header (optional checkbox, name input, optional copy button, delete button)
 */
export function Card({
  index,
  dataPrefix,
  name,
  enabled = true,
  showEnabledCheckbox = true,
  showCopyButton = false,
  draggable = false,
  children,
  placeholder,
}: CardProps): string {
  const defaultPlaceholder = placeholder ?? `${capitalize(dataPrefix)} name`;

  const enabledCheckbox = showEnabledCheckbox
    ? `<input type="checkbox" class="settings-checkbox" data-${dataPrefix}-enabled="${index}"${enabled ? ' checked' : ''}>`
    : '';

  const copyButton = showCopyButton
    ? `<button class="settings-btn settings-btn-icon settings-btn-copy" data-copy-${dataPrefix}="${index}" title="Copy to clipboard">&#x2398;</button>`
    : '';

  const reorderButtons = draggable
    ? `<span class="settings-reorder-buttons">
        <button class="settings-btn settings-btn-icon settings-btn-reorder" data-move-up-${dataPrefix}="${index}" title="Move up">\u25B2</button>
        <button class="settings-btn settings-btn-icon settings-btn-reorder" data-move-down-${dataPrefix}="${index}" title="Move down">\u25BC</button>
      </span>`
    : '';

  return `
    <div class="settings-pattern-group-card" data-${dataPrefix}-index="${index}">
      <div class="settings-pattern-group-header">
        ${enabledCheckbox}
        <input type="text" class="settings-input settings-group-name-input"
               data-${dataPrefix}-name="${index}"
               value="${escapeHtml(name)}" placeholder="${escapeHtml(defaultPlaceholder)}">
        ${copyButton}
        ${reorderButtons}
        <button class="settings-btn settings-btn-icon" data-delete-${dataPrefix}="${index}" title="Delete ${dataPrefix}">\u00d7</button>
      </div>
      ${children}
    </div>
  `;
}
