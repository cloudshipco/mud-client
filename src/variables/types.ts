/**
 * Type definitions for the variable capture and display system
 */

/** A captured variable value */
export interface Variable {
  value: string | number;
  type: "string" | "number";
  updatedAt: number;
}

/** Listener callback for variable changes */
export type VariableListener = (name: string, variable: Variable) => void;

/** Gauge color configuration */
export interface GaugeColors {
  high: string;   // > 66%
  mid: string;    // 33-66%
  low: string;    // < 33%
}

/** Configuration for a single gauge in the status line */
export interface GaugeConfig {
  variable: string;        // Variable name to display
  maxVariable?: string;    // Variable for max value (optional)
  max?: number;            // Static max value (if no maxVariable)
  label: string;           // Display label (e.g., "HP")
  width?: number;          // Bar width in chars (default: 10)
  color?: string;          // Custom gauge color (hex or ANSI)
  colors?: GaugeColors;    // ANSI color thresholds (legacy)
}

/** Status line configuration */
export interface StatusLineConfig {
  enabled: boolean;
  position: "above-input";  // Only option for now
}

/** Root YAML config for gauges */
export interface GaugesConfig {
  gauges: GaugeConfig[];
  statusLine: StatusLineConfig;
}

/** set_variable trigger action */
export interface SetVariableAction {
  type: "set_variable";
  name: string;           // Variable name to set
  capture: string;        // Named capture group from pattern match
  valueType?: "string" | "number";  // Optional type (default: string)
}
