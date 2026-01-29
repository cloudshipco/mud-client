/**
 * Type definitions for pane configuration (panes.yaml)
 */

// Pane filter configuration
export interface PaneFilter {
  patterns?: string[]; // Pattern group names to include
  excludePatterns?: string[]; // Pattern group names to exclude
  pattern?: string; // Custom regex for additional filtering
}

// Base pane configuration (common fields)
export interface BasePaneConfig {
  id: string;
  enabled?: boolean; // Defaults to true
  position: "top" | "floating";
  height: number;
  // Floating window position persistence
  width?: number;
  x?: number;
  y?: number;
}

// Message pane configuration (displays filtered messages)
export interface MessagePaneConfig extends BasePaneConfig {
  type?: "message"; // Default type
  filter: PaneFilter;
  maxMessages?: number;
  passthrough?: boolean; // If true, message also appears in main output
}

// Template pane configuration (displays variables with templates)
export interface TemplatePaneConfig extends BasePaneConfig {
  type: "template";
  template: string;        // Template string with ${variable} placeholders
  refreshRate?: number;    // ms between updates (default: 100)
}

// Union type for all pane configurations
export type PaneConfig = MessagePaneConfig | TemplatePaneConfig;

// Root YAML config (panes.yaml)
export interface PanesConfig {
  panes: PaneConfig[];
}

// Type guard for template pane config
export function isTemplatePaneConfig(config: PaneConfig): config is TemplatePaneConfig {
  return config.type === "template";
}

// Type guard for message pane config
export function isMessagePaneConfig(config: PaneConfig): config is MessagePaneConfig {
  return config.type !== "template";
}
