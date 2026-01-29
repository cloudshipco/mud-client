/**
 * Helper functions for settings components
 */

import type { TextInputProps, SelectProps, DeleteButtonProps } from './types';

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Secondary/muted text
 */
export function SecondaryText(text: string): string {
  return `<span class="settings-description">${escapeHtml(text)}</span>`;
}

/**
 * Delete button (x)
 */
export function DeleteButton({ dataAttr, index, title = 'Delete' }: DeleteButtonProps): string {
  return `<button class="settings-btn settings-btn-icon" data-${dataAttr}="${escapeHtml(index)}" title="${escapeHtml(title)}">\u00d7</button>`;
}

/**
 * Standard text input
 */
export function TextInput({ dataAttr, value, placeholder = '', style = '', className = '' }: TextInputProps): string {
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
  const classNames = ['settings-input', className].filter(Boolean).join(' ');
  return `<input type="text" class="${classNames}" data-${dataAttr}${styleAttr} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
}

/**
 * Standard select dropdown
 */
export function Select({ dataAttr, options, placeholder, style = '', className = '' }: SelectProps): string {
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
  const classNames = ['settings-select', className].filter(Boolean).join(' ');

  const optionsHtml = options.map(opt =>
    `<option value="${escapeHtml(opt.value)}"${opt.selected ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`
  ).join('');

  const placeholderHtml = placeholder
    ? `<option value="">${escapeHtml(placeholder)}</option>`
    : '';

  return `<select class="${classNames}" data-${dataAttr}${styleAttr}>${placeholderHtml}${optionsHtml}</select>`;
}

/**
 * Checkbox input
 */
export function Checkbox(dataAttr: string, checked: boolean, className = ''): string {
  const classNames = ['settings-checkbox', className].filter(Boolean).join(' ');
  return `<input type="checkbox" class="${classNames}" data-${dataAttr}${checked ? ' checked' : ''}>`;
}
