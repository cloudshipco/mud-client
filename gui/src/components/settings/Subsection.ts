/**
 * Subsection component - A labeled section within a card
 */

import type { SubsectionProps } from './types';
import { escapeHtml } from './helpers';

/**
 * Render a subsection with label, optional description, content, and optional add button
 */
export function Subsection({ label, description, children, addButton }: SubsectionProps): string {
  const descriptionHtml = description
    ? ` <span class="settings-description">(${escapeHtml(description)})</span>`
    : '';

  const buttonHtml = addButton
    ? `<button class="settings-btn settings-btn-secondary" data-${addButton.dataAttr}="${addButton.index}">${escapeHtml(addButton.label)}</button>`
    : '';

  return `
    <div class="settings-trigger-subsection">
      <label class="settings-label">${escapeHtml(label)}${descriptionHtml}</label>
      ${children}
      ${buttonHtml}
    </div>
  `;
}
