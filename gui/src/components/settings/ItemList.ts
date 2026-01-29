/**
 * ItemList component - A flex column container for rows (actions, conditions)
 */

import type { ItemListProps } from './types';

/**
 * Render a list container for action/condition rows
 */
export function ItemList({ children, className = 'settings-actions-list' }: ItemListProps): string {
  return `<div class="${className}">${children}</div>`;
}

/**
 * Render a conditions list container
 */
export function ConditionsList({ children }: { children: string }): string {
  return `<div class="settings-trigger-conditions-list">${children}</div>`;
}
