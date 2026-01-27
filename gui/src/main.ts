import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { loadSettings } from "./services/settings-store";
import { loadConfig, AppConfig } from "./services/config-store";
import { PanesConfig } from "./services/panes-config-store";
import { TerminalSettings } from "./types/settings";
import { parseGuiEvent, GuiEvent } from "./types/gui-events";
import { PaneRenderer } from "./components/pane-renderer";
import { MainOutput } from "./components/main-output";
import { InputLine } from "./components/input-line";
import { MenuRenderer } from "./components/menu-renderer";
import { PromptRenderer } from "./components/prompt-renderer";
import { applyThemeColors } from "./utils/ansi-parser";

import "./styles/fonts.css";
import "./styles/panes.css";

let settingsWindow: WebviewWindow | null = null;

async function openSettings() {
  // If window exists and is open, focus it
  if (settingsWindow) {
    try {
      await settingsWindow.setFocus();
      return;
    } catch {
      // Window was closed, create a new one
      settingsWindow = null;
    }
  }

  settingsWindow = new WebviewWindow("settings", {
    url: "settings.html",
    title: "Settings",
    width: 480,
    height: 580,
    resizable: true,
    minimizable: false,
    center: true,
  });

  settingsWindow.once("tauri://destroyed", () => {
    settingsWindow = null;
  });
}

async function main() {
  // Create app container immediately (before async operations)
  const appContainer = document.createElement("div");
  appContainer.className = "app-container";
  document.body.appendChild(appContainer);

  // Create status bar immediately so window is draggable right away
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";
  statusBar.setAttribute("data-tauri-drag-region", "");
  statusBar.innerHTML = `
    <div class="status-left">
      <span class="status-connection">Disconnected</span>
    </div>
    <div class="status-right">
      <span class="status-character"></span>
    </div>
  `;
  appContainer.appendChild(statusBar);

  // Create panes container (below status bar)
  const panesContainer = document.createElement("div");
  panesContainer.className = "panes-container";
  appContainer.appendChild(panesContainer);

  // Keep the HTML fallback drag region - it provides dragging during any loading state
  // Just ensure it doesn't visually interfere (it's transparent anyway)

  // Load saved settings and config
  const [settings, config] = await Promise.all([loadSettings(), loadConfig()]);

  // Apply settings via CSS custom properties
  const root = document.documentElement;
  root.style.setProperty("--font-family", settings.fontFamily);
  root.style.setProperty("--font-size", `${settings.fontSize}px`);
  root.style.setProperty("--font-weight", String(settings.fontWeight));
  root.style.setProperty("--font-weight-bold", String(settings.fontWeightBold));
  root.style.setProperty("--line-height", `${settings.lineHeight}`);
  root.style.setProperty("--letter-spacing", `${settings.letterSpacing}px`);

  // Set ANSI color palette from theme (also sets --theme-bg, --theme-fg)
  applyThemeColors(settings.theme);

  // Create pane renderers - we'll create them dynamically as events arrive
  const panes: Map<string, PaneRenderer> = new Map();

  // Create main output area
  const mainOutput = new MainOutput(appContainer);

  // Track connection state for reconnect handling
  let isConnected = false;

  // Create input line
  const inputLine = new InputLine(appContainer, {
    inputMode: config.inputMode,
    onInput: (data: string) => {
      // If disconnected and user presses Enter with empty input, show menu
      if (!isConnected && data === "\r") {
        invoke("write_to_pty", { data: "\r" }); // Trigger menu via backend
        return;
      }
      invoke("write_to_pty", { data });
    },
  });

  // Create menu and prompt renderers (overlays)
  const menuRenderer = new MenuRenderer(document.body);
  const promptRenderer = new PromptRenderer(document.body);

  // Get or create pane renderer
  function getOrCreatePane(id: string): PaneRenderer {
    let pane = panes.get(id);
    if (!pane) {
      // Create new pane with default height
      pane = new PaneRenderer(panesContainer, {
        id,
        title: id.charAt(0).toUpperCase() + id.slice(1),
        height: 5,
      });
      panes.set(id, pane);
    }
    return pane;
  }

  // Track connection info for window title
  let currentCharacter: string | null = null;
  let currentHost: string | null = null;

  function updateWindowTitle() {
    if (currentCharacter && currentHost) {
      invoke("set_window_title", { title: `${currentHost} - ${currentCharacter}` });
    }
  }

  function updateStatusBar(connected: boolean, character?: string, host?: string) {
    const connectionEl = statusBar.querySelector(".status-connection");
    const characterEl = statusBar.querySelector(".status-character");

    if (connectionEl) {
      connectionEl.textContent = connected ? "Connected" : "Disconnected";
    }
    if (characterEl && character && host) {
      characterEl.textContent = `${character}@${host}`;
    }

    statusBar.className = connected ? "status-bar" : "status-bar disconnected";
  }

  // Handle GUI events from PTY
  function handleGuiEvent(event: GuiEvent) {
    switch (event.event) {
      case "pane": {
        const pane = getOrCreatePane(event.id);
        pane.addMessages(event.messages);
        break;
      }
      case "main": {
        mainOutput.addLines(event.lines, event.ansi);
        break;
      }
      case "input": {
        // Handle passthrough mode first (e.g., for reverse search)
        // Must be before setText since setPassthroughMode(true) clears the input
        if (event.passthrough !== undefined) {
          inputLine.setPassthroughMode(event.passthrough);
        }
        inputLine.setPrompt(event.prompt);
        // Sync input text and cursor from backend (for history navigation, etc.)
        inputLine.setText(event.text);
        inputLine.setCursor(event.cursor);
        break;
      }
      case "status": {
        currentCharacter = event.character || null;
        currentHost = event.host || null;
        isConnected = event.connected;
        updateWindowTitle();
        updateStatusBar(event.connected, event.character, event.host);
        // Hide dialogs and exit passthrough mode when we enter client mode
        menuRenderer.hide();
        promptRenderer.hide();
        inputLine.setPassthroughMode(false);
        break;
      }
      case "clear": {
        if (event.target === "main") {
          mainOutput.clear();
        } else if (event.target === "pane" && event.id) {
          const pane = panes.get(event.id);
          if (pane) pane.clear();
        } else if (event.target === "all") {
          mainOutput.clear();
          panes.forEach((pane) => pane.clear());
        }
        break;
      }
      case "client": {
        mainOutput.addClientMessage(event.message);
        break;
      }
      case "menu": {
        // Hide prompt if showing
        promptRenderer.hide();
        // Show menu and enable passthrough mode for keyboard
        menuRenderer.show({
          title: event.title,
          items: event.items,
          selectedIndex: event.selectedIndex,
          showBack: event.showBack,
          allowDelete: event.allowDelete,
        });
        inputLine.setPassthroughMode(true);
        break;
      }
      case "prompt": {
        // Hide menu if showing
        menuRenderer.hide();
        // Show prompt and enable passthrough mode for keyboard
        promptRenderer.show({
          title: event.title,
          label: event.label,
          value: event.value,
          isPassword: event.isPassword,
        });
        inputLine.setPassthroughMode(true);
        break;
      }
      case "panes-config": {
        // Create pane containers for all enabled panes
        for (const paneConfig of event.panes) {
          if (paneConfig.enabled && !panes.has(paneConfig.id)) {
            const pane = new PaneRenderer(panesContainer, {
              id: paneConfig.id,
              title: paneConfig.title,
              height: paneConfig.height,
            });
            panes.set(paneConfig.id, pane);
          }
        }
        break;
      }
    }
  }

  // Hide menus/prompts when we get certain events that indicate we've moved on
  function hideDialogs() {
    menuRenderer.hide();
    promptRenderer.hide();
  }

  // Buffer for accumulating partial JSON lines
  let lineBuffer = "";

  // Set up PTY output listener
  listen<string>("pty-output", (event) => {
    const data = event.payload;

    // Accumulate data and process complete lines
    lineBuffer += data;
    const lines = lineBuffer.split("\n");

    // Keep the last incomplete line in the buffer
    lineBuffer = lines.pop() || "";

    // Process complete lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Debug: log all lines received
      console.log("[PTY] Line:", trimmed.substring(0, 100));

      // Try to parse as JSON first (all GUI events start with {)
      if (trimmed.startsWith("{")) {
        const guiEvent = parseGuiEvent(trimmed);
        if (guiEvent) {
          console.log("[PTY] Parsed event:", guiEvent.event);
          handleGuiEvent(guiEvent);
          continue;
        }
      }

      // Not a JSON event - filter out TUI garbage
      // Skip lines that contain ANSI escape codes or TUI artifacts
      const hasAnsiEscape = line.includes("\x1b");
      const hasBoxChars = /[┌┐└┘├┤─│]/.test(line);
      // Only check for stripped ANSI if line is short and looks like control sequence
      const looksLikeControl = line.length < 20 && /^\s*\[[\d;?]*[A-Za-z]/.test(line);

      if (hasAnsiEscape || hasBoxChars || looksLikeControl) {
        // Skip TUI garbage output
        continue;
      }

      // Only show in main output if we're in client mode (not during menus)
      if (!menuRenderer.isVisible() && !promptRenderer.isVisible()) {
        mainOutput.addLines([line], [line]);
      }
    }
  }).then(() => {
    // Spawn PTY after listener is set up
    // Use a fixed size since we're not using xterm anymore
    invoke("spawn_pty", { cols: 120, rows: 40 }).catch((error) => {
      mainOutput.addClientMessage(`Error: ${error}`);
    });
  });

  // Listen for settings changes
  listen<TerminalSettings>("settings-changed", (event) => {
    const newSettings = event.payload;
    applySettings(newSettings);
  });

  // Listen for config changes
  listen<AppConfig>("config-changed", (event) => {
    const newConfig = event.payload;
    inputLine.setInputMode(newConfig.inputMode);
  });

  // Listen for panes config changes (from settings window)
  listen<PanesConfig>("panes-config-changed", (event) => {
    const newPanesConfig = event.payload;

    // Track which panes should be enabled
    const enabledPaneIds = new Set<string>();
    for (const paneConfig of newPanesConfig.panes) {
      if (paneConfig.enabled !== false) {
        enabledPaneIds.add(paneConfig.id);
      }
    }

    // Remove panes that are now disabled
    for (const [paneId, pane] of panes) {
      if (!enabledPaneIds.has(paneId)) {
        pane.destroy();
        panes.delete(paneId);
      }
    }

    // Add or update enabled panes
    for (const paneConfig of newPanesConfig.panes) {
      if (paneConfig.enabled === false) continue;

      const existingPane = panes.get(paneConfig.id);
      if (existingPane) {
        // Update height if changed
        existingPane.setHeightInLines(paneConfig.height);
      } else {
        // Create new pane
        const pane = new PaneRenderer(panesContainer, {
          id: paneConfig.id,
          title: paneConfig.id.charAt(0).toUpperCase() + paneConfig.id.slice(1),
          height: paneConfig.height,
        });
        panes.set(paneConfig.id, pane);
      }
    }
  });

  // Apply settings to the app using CSS custom properties
  function applySettings(newSettings: TerminalSettings) {
    const root = document.documentElement;
    root.style.setProperty("--font-family", newSettings.fontFamily);
    root.style.setProperty("--font-size", `${newSettings.fontSize}px`);
    root.style.setProperty("--font-weight", String(newSettings.fontWeight));
    root.style.setProperty("--font-weight-bold", String(newSettings.fontWeightBold));
    root.style.setProperty("--line-height", `${newSettings.lineHeight}`);
    root.style.setProperty("--letter-spacing", `${newSettings.letterSpacing}px`);
    // Update ANSI color palette (also sets --theme-bg)
    applyThemeColors(newSettings.theme);
  }

  // Global key handling for menus, prompts, and scrolling
  // Note: Cmd/Ctrl+, for settings is handled by the native menu accelerator
  window.addEventListener("keydown", (e) => {
    // When menu or prompt is showing, capture navigation keys globally
    // This ensures arrow keys work even if input doesn't have focus
    if (menuRenderer.isVisible() || promptRenderer.isVisible()) {
      const keyMap: Record<string, string> = {
        ArrowUp: "\x1b[A",
        ArrowDown: "\x1b[B",
        ArrowLeft: "\x1b[D",
        ArrowRight: "\x1b[C",
        Enter: "\r",
        Escape: "\x1b",
        Backspace: "\x7f",
        Tab: "\t",
      };

      if (keyMap[e.key]) {
        e.preventDefault();
        invoke("write_to_pty", { data: keyMap[e.key] });
        return;
      }

      // Single character keys (for typing in prompts, vim-style j/k navigation)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        invoke("write_to_pty", { data: e.key });
        return;
      }
    }

    // Page Up/Down for scrolling main output (only when not in menu/prompt)
    if (e.key === "PageUp") {
      e.preventDefault();
      mainOutput.pageUp();
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      mainOutput.pageDown();
    }
  });

  // Focus input on click (but not if selecting text)
  document.addEventListener("click", () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      inputLine.focus();
    }
  });

  // Initial focus
  inputLine.focus();
}

main().catch(console.error);
