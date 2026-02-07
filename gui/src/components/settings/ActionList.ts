/**
 * ActionList component - A sortable list of actions with add button
 * Used by both triggers and timers
 */

import type { ActionListProps } from './types';
import { ActionRow } from './ActionRow';

/**
 * Render a list of actions with reorder buttons and an add button
 */
export function ActionList({
  context,
  parentIndex,
  actions,
  actionTypes,
  triggerOptions = [],
  timerOptions = [],
  captureOptions = [],
}: ActionListProps): string {
  const dataAttrPrefix = context === 'trigger' ? 'trigger' : 'timer';

  const actionRows = actions.map((action, actionIndex) =>
    ActionRow({
      context,
      parentIndex,
      actionIndex,
      action,
      actionTypes,
      triggerOptions,
      timerOptions,
      captureOptions,
      isFirst: actionIndex === 0,
      isLast: actionIndex === actions.length - 1,
    })
  ).join('');

  const emptyState = actions.length === 0
    ? '<div class="settings-description" style="padding: 8px 0;">No actions configured</div>'
    : '';

  return `
    <div class="settings-action-list">
      <div class="settings-subsection-header">
        <span class="settings-label">Actions</span>
        <button class="settings-btn settings-btn-small" data-add-${dataAttrPrefix}-action="${parentIndex}">+ Add Action</button>
      </div>
      <div class="settings-actions-list">
        ${emptyState}
        ${actionRows}
      </div>
    </div>
  `;
}
