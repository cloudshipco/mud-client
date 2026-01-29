/**
 * FormRow component - Inline form elements with optional labels
 */

import type { FormRowProps } from './types';

/**
 * Render a form row container for inline form elements
 */
export function FormRow({ children }: FormRowProps): string {
  return `<div class="settings-trigger-action-row">${children}</div>`;
}
