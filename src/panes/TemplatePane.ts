/**
 * TemplatePane - Displays variables with template interpolation
 *
 * Renders a template string with ${variable} placeholders replaced
 * by values from the VariableStore.
 */

import type { TemplatePaneConfig } from "./types";
import type { VariableStore } from "../variables/VariableStore";

const ESC = "\x1b";
const CSI = `${ESC}[`;
const CLEAR_LINE = `${CSI}2K`;
const CURSOR_TO = (row: number, col: number) => `${CSI}${row};${col}H`;

const DIM = "\x1b[90m";
const RESET = "\x1b[0m";

export class TemplatePane {
  readonly id: string;
  readonly template: string;
  private _enabled: boolean;
  private _focused: boolean = false;
  private height: number;
  private originalHeight: number;
  private topRow: number = 0;
  private refreshRate: number;
  private variableStore: VariableStore | null = null;
  private unsubscribe: (() => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRefresh: boolean = false;

  constructor(config: TemplatePaneConfig) {
    this.id = config.id;
    this.template = config.template;
    this.height = config.height;
    this.originalHeight = config.height;
    this._enabled = config.enabled ?? true;
    this.refreshRate = config.refreshRate ?? 100;
  }

  /**
   * Connect to a VariableStore to receive updates
   */
  connect(variableStore: VariableStore): void {
    this.variableStore = variableStore;

    // Subscribe to changes - debounce via refresh timer
    this.unsubscribe = variableStore.onChange(() => {
      if (!this.pendingRefresh && this._enabled) {
        this.pendingRefresh = true;
        this.refreshTimer = setTimeout(() => {
          this.pendingRefresh = false;
          this.render();
        }, this.refreshRate);
      }
    });
  }

  /**
   * Disconnect from the VariableStore
   */
  disconnect(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.variableStore = null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (enabled) {
      this.render();
    }
  }

  get title(): string {
    return this.id.charAt(0).toUpperCase() + this.id.slice(1);
  }

  get focused(): boolean {
    return this._focused;
  }

  setFocused(focused: boolean): void {
    this._focused = focused;
    this.render();
  }

  setPosition(topRow: number, height: number): void {
    this.topRow = topRow;
    this.height = height;
  }

  getHeight(): number {
    return this.height;
  }

  setHeight(height: number): void {
    this.height = height;
  }

  restoreOriginalHeight(): void {
    this.height = this.originalHeight;
  }

  setOriginalHeight(height: number): void {
    this.originalHeight = height;
    this.height = height;
  }

  getOriginalHeight(): number {
    return this.originalHeight;
  }

  /**
   * Interpolate template with variable values
   */
  private interpolate(): string[] {
    if (!this.variableStore) {
      return [this.template];
    }

    const values = this.variableStore.getAllValues();
    let result = this.template;

    // Replace ${variable} patterns
    result = result.replace(/\$\{(\w+)\}/g, (match, name) => {
      if (name in values) {
        return String(values[name]);
      }
      return `${DIM}--${RESET}`; // Show placeholder for missing values
    });

    // Split into lines
    return result.split("\n");
  }

  render(): void {
    if (this.topRow === 0 || !this._enabled) return;

    const termWidth = process.stdout.columns || 80;
    const lines = this.interpolate();

    // Focus indicator: yellow left border
    const borderChar = this._focused ? "\x1b[33m│\x1b[0m" : "";
    const borderWidth = this._focused ? 1 : 0;
    const contentWidth = termWidth - borderWidth;

    // Clear all lines in pane
    for (let i = 0; i < this.height; i++) {
      const row = this.topRow + i;
      process.stdout.write(CURSOR_TO(row, 1) + CLEAR_LINE);
      if (this._focused) {
        process.stdout.write(borderChar);
      }
    }

    // Write lines (top-aligned)
    const visibleLines = lines.slice(0, this.height);
    for (let i = 0; i < visibleLines.length; i++) {
      let line = visibleLines[i];

      // Truncate if too long
      const visibleLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
      if (visibleLen > contentWidth) {
        line = line.slice(0, contentWidth - 3) + "...";
      }

      const row = this.topRow + i;
      process.stdout.write(CURSOR_TO(row, 1) + borderChar + line);
    }
  }

  clear(): void {
    // Template panes don't have messages to clear
    this.render();
  }

  // Stub methods for compatibility with PaneManager
  // Template panes don't accept messages
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  accepts(_classified: { type: string; raw: string }): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addMessage(_text: string, _classified: { type: string; raw: string }): void {
    // Template panes don't store messages
  }

  getPassthrough(): boolean {
    return false;
  }

  getMessageCount(): number {
    return 0;
  }

  scrollUp(_lines: number): void {
    // Template panes don't scroll
  }

  scrollDown(_lines: number): void {
    // Template panes don't scroll
  }

  resetScroll(): void {
    // Template panes don't scroll
  }

  hasNewContent(): boolean {
    return false;
  }

  getScrollOffset(): number {
    return 0;
  }

  /**
   * Convert pane state to JSON-serializable object for GUI mode
   */
  toJSON(): {
    id: string;
    enabled: boolean;
    height: number;
    passthrough: boolean;
    type: "template";
    template: string;
    content: string;
  } {
    return {
      id: this.id,
      enabled: this._enabled,
      height: this.height,
      passthrough: false,
      type: "template",
      template: this.template,
      content: this.interpolate().join("\n"),
    };
  }
}
