/**
 * In-memory store for captured variables from trigger pattern matches.
 * Variables are not persisted - they repopulate from MUD output.
 */

import type { Variable, VariableListener } from "./types";

export class VariableStore {
  private variables: Map<string, Variable> = new Map();
  private listeners: Set<VariableListener> = new Set();

  /**
   * Set a variable value
   */
  set(name: string, value: string | number, type?: "string" | "number"): void {
    const inferredType = type ?? (typeof value === "number" ? "number" : "string");
    const variable: Variable = {
      value,
      type: inferredType,
      updatedAt: Date.now(),
    };

    this.variables.set(name, variable);

    // Notify listeners
    for (const listener of this.listeners) {
      listener(name, variable);
    }
  }

  /**
   * Get a variable by name
   */
  get(name: string): Variable | undefined {
    return this.variables.get(name);
  }

  /**
   * Get the raw value of a variable
   */
  getValue(name: string): string | number | undefined {
    return this.variables.get(name)?.value;
  }

  /**
   * Get all variables as a plain object
   */
  getAll(): Record<string, Variable> {
    const result: Record<string, Variable> = {};
    for (const [name, variable] of this.variables) {
      result[name] = variable;
    }
    return result;
  }

  /**
   * Get all variable values as a plain object (for template interpolation)
   */
  getAllValues(): Record<string, string | number> {
    const result: Record<string, string | number> = {};
    for (const [name, variable] of this.variables) {
      result[name] = variable.value;
    }
    return result;
  }

  /**
   * Check if a variable exists
   */
  has(name: string): boolean {
    return this.variables.has(name);
  }

  /**
   * Delete a variable
   */
  delete(name: string): boolean {
    return this.variables.delete(name);
  }

  /**
   * Clear all variables
   */
  clear(): void {
    this.variables.clear();
  }

  /**
   * Register a listener for variable changes.
   * Returns an unsubscribe function.
   */
  onChange(listener: VariableListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get the number of variables
   */
  get size(): number {
    return this.variables.size;
  }
}
