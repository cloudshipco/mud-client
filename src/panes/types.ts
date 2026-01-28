/**
 * Type definitions for pane configuration (panes.yaml)
 */

// Pane filter configuration
export interface PaneFilter {
  patterns?: string[]; // Pattern group names to include
  excludePatterns?: string[]; // Pattern group names to exclude
  pattern?: string; // Custom regex for additional filtering
}

// Pane configuration
export interface PaneConfig {
  id: string;
  enabled?: boolean; // Defaults to true
  position: "top";
  height: number;
  filter: PaneFilter;
  maxMessages?: number;
  passthrough?: boolean; // If true, message also appears in main output
}

// Root YAML config (panes.yaml)
export interface PanesConfig {
  panes: PaneConfig[];
}
