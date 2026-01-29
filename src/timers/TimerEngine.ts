import { TimerConfigStore } from "./TimerConfigStore";
import type { TimerDefinition, TimersConfig } from "./TimerConfigStore";

interface RunningTimer {
  definition: TimerDefinition;
  intervalId: ReturnType<typeof setInterval>;
}

export class TimerEngine {
  private store: TimerConfigStore;
  private running: Map<string, RunningTimer> = new Map();
  /** Runtime enable/disable overrides (cleared on reload) */
  private runtimeEnabled: Map<string, boolean> = new Map();
  private configHash: string = "";
  private commandCallback: (command: string) => void;

  constructor(store: TimerConfigStore, commandCallback: (command: string) => void) {
    this.store = store;
    this.commandCallback = commandCallback;
    const config = store.getConfig();
    this.configHash = this.computeConfigHash(config);
    this.startTimersFromConfig(config);
  }

  private computeConfigHash(config: TimersConfig): string {
    return JSON.stringify(config);
  }

  /**
   * Check if config changed and restart timers if needed.
   * Call this periodically to pick up GUI changes.
   */
  updateIfChanged(config: TimersConfig): boolean {
    const newHash = this.computeConfigHash(config);
    if (newHash !== this.configHash) {
      this.configHash = newHash;
      this.runtimeEnabled.clear();
      this.restartTimers(config);
      return true;
    }
    return false;
  }

  private isEnabled(timer: TimerDefinition): boolean {
    const runtimeOverride = this.runtimeEnabled.get(timer.name);
    if (runtimeOverride !== undefined) return runtimeOverride;
    return timer.enabled;
  }

  private startTimersFromConfig(config: TimersConfig): void {
    for (const timer of config.timers) {
      if (this.isEnabled(timer) && timer.interval > 0) {
        this.startTimer(timer);
      }
    }
  }

  private startTimer(timer: TimerDefinition): void {
    // Don't start if already running
    if (this.running.has(timer.name)) return;

    const intervalMs = timer.interval * 1000;
    const intervalId = setInterval(() => {
      // Re-check enabled state each tick
      if (!this.isEnabled(timer)) return;

      for (const command of timer.commands) {
        this.commandCallback(command);
      }
    }, intervalMs);

    this.running.set(timer.name, { definition: timer, intervalId });
  }

  private stopTimer(name: string): void {
    const running = this.running.get(name);
    if (running) {
      clearInterval(running.intervalId);
      this.running.delete(name);
    }
  }

  private restartTimers(config: TimersConfig): void {
    // Stop all existing timers
    for (const name of this.running.keys()) {
      this.stopTimer(name);
    }

    // Start timers based on new config
    this.startTimersFromConfig(config);
  }

  /**
   * Runtime enable/disable (does not persist - use store.setEnabled for persistence)
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const config = this.store.getConfig();
    const timer = config.timers.find((t) => t.name === name);
    if (!timer) return false;

    this.runtimeEnabled.set(name, enabled);

    if (enabled && timer.interval > 0) {
      // Start if not already running
      if (!this.running.has(name)) {
        this.startTimer(timer);
      }
    } else {
      // Stop if running
      this.stopTimer(name);
    }

    return true;
  }

  /** Reload timers from disk */
  reload(): void {
    const config = this.store.reload();
    this.configHash = this.computeConfigHash(config);
    this.runtimeEnabled.clear();
    this.restartTimers(config);
  }

  /** List all timers with their effective enabled state */
  listTimers(): { name: string; enabled: boolean; interval: number; commandCount: number }[] {
    const config = this.store.getConfig();
    return config.timers.map((t) => ({
      name: t.name,
      enabled: this.isEnabled(t),
      interval: t.interval,
      commandCount: t.commands.length,
    }));
  }

  /** Clean up all intervals on exit */
  cleanup(): void {
    for (const name of this.running.keys()) {
      this.stopTimer(name);
    }
  }
}
