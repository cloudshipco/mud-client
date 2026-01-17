export interface Macro {
  name: string;
  commands: string[];
  createdAt: number;
  updatedAt: number;
}

export type MacroMap = Record<string, Macro>;

export type RecordingState = "idle" | "recording" | "paused";
