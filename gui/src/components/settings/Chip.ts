/**
 * Chip component - Selectable chip for pattern groups
 */

import type { ChipProps } from './types';
import { escapeHtml } from './helpers';

/**
 * Render a selectable chip (for pattern group selection)
 */
export function Chip({ label, selected, dataAttr, value }: ChipProps): string {
  return `
    <label class="settings-chip${selected ? ' active' : ''}">
      <input type="checkbox" data-${dataAttr}="${escapeHtml(value)}"${selected ? ' checked' : ''}>
      ${escapeHtml(label)}
    </label>
  `;
}

/**
 * Render a container for chips
 */
export function ChipContainer({ children }: { children: string }): string {
  return `<div class="settings-pane-pattern-chips">${children}</div>`;
}
