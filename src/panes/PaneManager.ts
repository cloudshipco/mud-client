/**
 * PaneManager - Manages multiple stacking panes and message routing
 */

import type { PaneConfig, MessagePaneConfig, TemplatePaneConfig } from "./types";
import { isTemplatePaneConfig, isMessagePaneConfig } from "./types";
import type { ClassifiedMessage } from "../messages/MessageClassifier";
import { Pane } from "./Pane";
import { TemplatePane } from "./TemplatePane";
import type { VariableStore } from "../variables/VariableStore";

/** Union type for all pane instances */
type AnyPane = Pane | TemplatePane;

export class PaneManager {
  private panes: AnyPane[] = [];
  private variableStore: VariableStore | null = null;

  constructor(configs: PaneConfig[]) {
    for (const config of configs) {
      // Create panes regardless of position - GUI handles display location
      // Backend just needs to route messages to all panes
      if (isTemplatePaneConfig(config)) {
        this.panes.push(new TemplatePane(config));
      } else {
        this.panes.push(new Pane(config as MessagePaneConfig));
      }
    }
  }

  /**
   * Connect template panes to a VariableStore for reactive updates
   */
  connectVariableStore(variableStore: VariableStore): void {
    this.variableStore = variableStore;
    for (const pane of this.panes) {
      if (pane instanceof TemplatePane) {
        pane.connect(variableStore);
      }
    }
  }

  private getEnabledPanes(): AnyPane[] {
    return this.panes.filter((p) => p.enabled);
  }

  getTotalHeight(): number {
    return this.getEnabledPanes().reduce((sum, pane) => sum + pane.getHeight(), 0);
  }

  getPaneCount(): number {
    return this.getEnabledPanes().length;
  }

  getPaneIds(): string[] {
    return this.panes.map((p) => p.id);
  }

  getEnabledPaneIds(): string[] {
    return this.getEnabledPanes().map((p) => p.id);
  }

  getPaneStatus(): Array<{ id: string; enabled: boolean }> {
    return this.panes.map((p) => ({ id: p.id, enabled: p.enabled }));
  }

  enablePane(id: string): boolean {
    const pane = this.panes.find((p) => p.id === id);
    if (pane) {
      pane.setEnabled(true);
      return true;
    }
    return false;
  }

  disablePane(id: string): boolean {
    const pane = this.panes.find((p) => p.id === id);
    if (pane) {
      pane.setEnabled(false);
      return true;
    }
    return false;
  }

  layoutPanes(startRow: number = 1): void {
    let currentRow = startRow;
    for (const pane of this.getEnabledPanes()) {
      pane.setPosition(currentRow, pane.getHeight());
      currentRow += pane.getHeight();
    }
  }

  route(text: string, classified: ClassifiedMessage): boolean {
    let matched = false;
    let anyPassthrough = false;

    for (const pane of this.getEnabledPanes()) {
      if (pane.accepts(classified)) {
        pane.addMessage(text, classified);
        matched = true;
        if (pane.getPassthrough()) {
          anyPassthrough = true;
        }
      }
    }

    // Consume (remove from main) only if matched and no pane wants passthrough
    return matched && !anyPassthrough;
  }

  renderAll(): void {
    for (const pane of this.getEnabledPanes()) {
      pane.render();
    }
  }

  clearAll(): void {
    for (const pane of this.getEnabledPanes()) {
      pane.clear();
    }
  }

  getPane(id: string): AnyPane | undefined {
    return this.panes.find((p) => p.id === id);
  }

  /**
   * Get a message pane by ID (returns undefined for template panes)
   */
  getMessagePane(id: string): Pane | undefined {
    const pane = this.panes.find((p) => p.id === id);
    return pane instanceof Pane ? pane : undefined;
  }

  /**
   * Get a template pane by ID (returns undefined for message panes)
   */
  getTemplatePane(id: string): TemplatePane | undefined {
    const pane = this.panes.find((p) => p.id === id);
    return pane instanceof TemplatePane ? pane : undefined;
  }

  /**
   * Convert all panes to JSON-serializable format for GUI mode
   */
  toJSON(): Array<ReturnType<Pane["toJSON"]> | ReturnType<TemplatePane["toJSON"]>> {
    return this.panes.map((p) => p.toJSON());
  }

  /**
   * Update pane configs from a new list
   * Updates filters and enabled state for existing panes
   */
  updateConfigs(configs: PaneConfig[]): void {
    for (const config of configs) {
      const pane = this.panes.find((p) => p.id === config.id);
      if (pane) {
        // Only update filter for message panes
        if (pane instanceof Pane && isMessagePaneConfig(config)) {
          pane.updateFilter(config.filter);
        }
        pane.setEnabled(config.enabled ?? true);
      }
    }
  }
}
