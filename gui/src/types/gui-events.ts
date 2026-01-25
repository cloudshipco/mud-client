/**
 * Type definitions for GUI mode JSON events from mud-client
 */

export interface GuiPaneMessage {
  text: string;           // Plain text (ANSI stripped)
  ansi: string;           // With ANSI codes
  type: string;           // tell, channel, say, other
  sender?: string;
  channel?: string;
  timestamp: number;
}

export interface GuiPaneEvent {
  event: "pane";
  id: string;
  messages: GuiPaneMessage[];
}

export interface GuiMainEvent {
  event: "main";
  lines: string[];        // Plain text lines
  ansi: string[];         // Lines with ANSI codes
}

export interface GuiInputEvent {
  event: "input";
  prompt: string;
  text: string;
  cursor: number;
  passthrough?: boolean;  // When true, frontend should send all keys directly to PTY
}

export interface GuiStatusEvent {
  event: "status";
  connected: boolean;
  character?: string;
  host?: string;
}

export interface GuiClearEvent {
  event: "clear";
  target: "main" | "pane" | "all";
  id?: string;
}

export interface GuiClientMessageEvent {
  event: "client";
  message: string;
}

export interface GuiMenuEvent {
  event: "menu";
  title: string;
  items: Array<{ label: string; value: string; isNew?: boolean }>;
  selectedIndex: number;
  showBack: boolean;
  allowDelete: boolean;
}

export interface GuiPromptEvent {
  event: "prompt";
  title: string;
  label: string;
  value: string;
  isPassword: boolean;
}

export interface GuiPaneConfig {
  id: string;
  title: string;
  height: number;
  enabled: boolean;
}

export interface GuiPanesConfigEvent {
  event: "panes-config";
  panes: GuiPaneConfig[];
}

export type GuiEvent =
  | GuiPaneEvent
  | GuiMainEvent
  | GuiInputEvent
  | GuiStatusEvent
  | GuiClearEvent
  | GuiClientMessageEvent
  | GuiMenuEvent
  | GuiPromptEvent
  | GuiPanesConfigEvent;

/**
 * Parse a JSON line from PTY output into a GuiEvent
 * Returns null if the line is not valid JSON or not a GUI event
 */
export function parseGuiEvent(line: string): GuiEvent | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed.event === "string") {
      return parsed as GuiEvent;
    }
  } catch {
    // Not JSON, ignore
  }
  return null;
}
