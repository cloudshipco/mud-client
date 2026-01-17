import { MacroStore } from "./MacroStore";
import type { Macro, RecordingState } from "./types";

export class MacroManager {
  private store: MacroStore;
  private recordingState: RecordingState = "idle";
  private currentSessionName: string | null = null;
  private currentCommands: string[] = [];

  constructor() {
    this.store = new MacroStore();
  }

  // Recording control
  startRecording(name: string): { success: boolean; message: string } {
    if (this.recordingState === "recording") {
      return { success: false, message: `Already recording macro '${this.currentSessionName}'` };
    }

    if (this.recordingState === "paused" && this.currentSessionName === name) {
      // Resume recording the same macro
      this.recordingState = "recording";
      return { success: true, message: `Resumed recording macro '${name}'` };
    }

    if (this.recordingState === "paused") {
      // Starting a new macro while another is paused - discard the paused one
      this.currentCommands = [];
    }

    this.recordingState = "recording";
    this.currentSessionName = name;
    this.currentCommands = [];
    return { success: true, message: `Recording macro '${name}'` };
  }

  resumeRecording(): { success: boolean; message: string } {
    if (this.recordingState === "idle") {
      return { success: false, message: "No macro recording to resume" };
    }

    if (this.recordingState === "recording") {
      return { success: false, message: `Already recording macro '${this.currentSessionName}'` };
    }

    this.recordingState = "recording";
    return { success: true, message: `Resumed recording macro '${this.currentSessionName}'` };
  }

  pauseRecording(): { success: boolean; message: string } {
    if (this.recordingState !== "recording") {
      return { success: false, message: "Not currently recording" };
    }

    this.recordingState = "paused";
    return { success: true, message: `Paused recording macro '${this.currentSessionName}' (${this.currentCommands.length} commands)` };
  }

  finishRecording(): { success: boolean; message: string; commandCount: number } {
    if (this.recordingState === "idle") {
      return { success: false, message: "No macro recording to finish", commandCount: 0 };
    }

    const name = this.currentSessionName!;
    const commands = [...this.currentCommands];
    const commandCount = commands.length;

    if (commandCount === 0) {
      this.recordingState = "idle";
      this.currentSessionName = null;
      this.currentCommands = [];
      return { success: false, message: `Macro '${name}' discarded (no commands)`, commandCount: 0 };
    }

    this.store.set(name, commands);
    this.recordingState = "idle";
    this.currentSessionName = null;
    this.currentCommands = [];

    return { success: true, message: `Saved macro '${name}' with ${commandCount} commands`, commandCount };
  }

  cancelRecording(): { success: boolean; message: string } {
    if (this.recordingState === "idle") {
      return { success: false, message: "No macro recording to cancel" };
    }

    const name = this.currentSessionName;
    this.recordingState = "idle";
    this.currentSessionName = null;
    this.currentCommands = [];

    return { success: true, message: `Cancelled recording macro '${name}'` };
  }

  // State queries
  isRecording(): boolean {
    return this.recordingState === "recording";
  }

  isPaused(): boolean {
    return this.recordingState === "paused";
  }

  getState(): RecordingState {
    return this.recordingState;
  }

  getCurrentSessionName(): string | null {
    return this.currentSessionName;
  }

  getCurrentCommandCount(): number {
    return this.currentCommands.length;
  }

  // Recording
  recordCommand(command: string): void {
    if (this.recordingState === "recording") {
      this.currentCommands.push(command);
    }
  }

  // Playback
  getMacro(name: string): Macro | undefined {
    return this.store.get(name);
  }

  playMacro(name: string): { success: boolean; commands: string[]; message: string } {
    const macro = this.store.get(name);
    if (!macro) {
      return { success: false, commands: [], message: `Macro '${name}' not found` };
    }

    return { success: true, commands: macro.commands, message: `Playing macro '${name}'` };
  }

  // Management
  deleteMacro(name: string): { success: boolean; message: string } {
    if (this.store.remove(name)) {
      return { success: true, message: `Deleted macro '${name}'` };
    }
    return { success: false, message: `Macro '${name}' not found` };
  }

  listMacros(): Macro[] {
    return this.store.list();
  }

  hasMacro(name: string): boolean {
    return this.store.has(name);
  }
}
