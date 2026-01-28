import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { loadSettings } from "./services/settings-store";
import { loadConfig, AppConfig } from "./services/config-store";
import { PanesConfig, PaneConfig, savePanesConfig, loadPanesConfig, updatePane } from "./services/panes-config-store";
import { NotificationsConfig, loadNotificationsConfig } from "./services/notifications-config-store";
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
const floatingPanes: Map<string, WebviewWindow> = new Map();
const floatingPanesClosingProgrammatically: Set<string> = new Set();
let currentPanesConfig: PanesConfig | null = null;

// Pending update held until user explicitly runs /update
let pendingUpdate: Awaited<ReturnType<typeof check>> | null = null;

async function openFloatingPane(paneConfig: PaneConfig) {
  const windowLabel = `pane-${paneConfig.id}`;

  // If already open, focus it
  const existing = floatingPanes.get(paneConfig.id);
  if (existing) {
    try {
      await existing.setFocus();
      return;
    } catch {
      floatingPanes.delete(paneConfig.id);
    }
  }

  const windowOptions: ConstructorParameters<typeof WebviewWindow>[1] = {
    url: "floating-pane.html",
    title: paneConfig.id.charAt(0).toUpperCase() + paneConfig.id.slice(1),
    width: paneConfig.width || 400,
    height: paneConfig.height ? paneConfig.height * 20 : 200,
    resizable: true,
    minimizable: true,
    decorations: true,
  };

  // Restore saved position
  if (paneConfig.x !== undefined && paneConfig.y !== undefined) {
    windowOptions.x = paneConfig.x;
    windowOptions.y = paneConfig.y;
  } else {
    windowOptions.center = true;
  }

  const floatingWindow = new WebviewWindow(windowLabel, windowOptions);
  floatingPanes.set(paneConfig.id, floatingWindow);

  floatingWindow.once("tauri://destroyed", async () => {
    floatingPanes.delete(paneConfig.id);
    // If the user closed the window (not a programmatic close), revert to docked
    if (!floatingPanesClosingProgrammatically.delete(paneConfig.id)) {
      if (currentPanesConfig) {
        currentPanesConfig = updatePane(currentPanesConfig, paneConfig.id, { position: 'top' });
        try { await savePanesConfig(currentPanesConfig); } catch { /* non-critical */ }
      }
    }
  });

  // Persist position on move/resize
  floatingWindow.onMoved(async (position) => {
    await persistFloatingPanePosition(paneConfig.id, { x: position.payload.x, y: position.payload.y });
  });

  floatingWindow.onResized(async (size) => {
    await persistFloatingPanePosition(paneConfig.id, { width: size.payload.width });
  });
}

async function closeFloatingPane(paneId: string) {
  const floatingWindow = floatingPanes.get(paneId);
  if (floatingWindow) {
    floatingPanesClosingProgrammatically.add(paneId);
    try {
      await floatingWindow.close();
    } catch {
      // already closed
      floatingPanesClosingProgrammatically.delete(paneId);
    }
    floatingPanes.delete(paneId);
  }
}

async function persistFloatingPanePosition(paneId: string, updates: { x?: number; y?: number; width?: number }) {
  if (!currentPanesConfig) return;
  currentPanesConfig = updatePane(currentPanesConfig, paneId, updates);
  try {
    await savePanesConfig(currentPanesConfig);
  } catch {
    // non-critical, position just won't persist
  }
}

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
    width: 660,
    height: 820,
    resizable: true,
    minimizable: false,
    center: true,
  });

  settingsWindow.once("tauri://destroyed", () => {
    settingsWindow = null;
  });
}

async function checkForUpdates(showMessage: (msg: string) => void) {
  try {
    const update = await check();
    if (update) {
      pendingUpdate = update;
      showMessage(`Update available: v${update.version}. Type /update to install.`);
    }
  } catch (error) {
    console.error("Update check failed:", error);
  }
}

async function installPendingUpdate(showMessage: (msg: string) => void) {
  if (!pendingUpdate) {
    showMessage("No update available.");
    return;
  }
  const update = pendingUpdate;
  pendingUpdate = null;
  showMessage(`Downloading v${update.version}...`);
  try {
    await update.downloadAndInstall();
    showMessage("Update installed. Relaunching...");
    await relaunch();
  } catch (error) {
    showMessage(`Update failed: ${error}`);
  }
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

  // Load saved settings, config, and notifications config
  const [settings, config, notificationsConfig, panesConfig] = await Promise.all([
    loadSettings(),
    loadConfig(),
    loadNotificationsConfig(),
    loadPanesConfig(),
  ]);

  currentPanesConfig = panesConfig;

  // Open floating pane windows on startup
  if (currentPanesConfig) {
    for (const paneConfig of currentPanesConfig.panes) {
      if (paneConfig.enabled !== false && paneConfig.position === "floating") {
        openFloatingPane(paneConfig);
      }
    }
  }

  // Track current notifications config (can be updated from settings)
  let currentNotificationsConfig: NotificationsConfig = notificationsConfig;

  // Request notification permission
  let notificationsPermissionGranted = await isPermissionGranted();
  if (!notificationsPermissionGranted) {
    const permission = await requestPermission();
    notificationsPermissionGranted = permission === "granted";
  }

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
      // Intercept /update command
      if (data.replace(/\r?\n?$/, "") === "/update") {
        installPendingUpdate((msg) => mainOutput.addClientMessage(msg));
        return;
      }
      invoke("write_to_pty", { data });
    },
    onResize: () => {
      // When input area resizes, maintain scroll position
      mainOutput.handleLayoutChange();
    },
  });

  // Create menu and prompt renderers (overlays)
  const menuRenderer = new MenuRenderer(document.body, (clickedIndex: number) => {
    // Navigate to the clicked item and select it
    const currentIndex = menuRenderer.getSelectedIndex();
    const delta = clickedIndex - currentIndex;

    // Send navigation keys to move to the clicked item
    const arrowKey = delta > 0 ? "\x1b[B" : "\x1b[A"; // Down or Up
    for (let i = 0; i < Math.abs(delta); i++) {
      invoke("write_to_pty", { data: arrowKey });
    }

    // Send Enter to select the item
    invoke("write_to_pty", { data: "\r" });
  });
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
        // Check if this pane is floating
        if (floatingPanes.has(event.id)) {
          // Forward messages to the floating window
          emit(`pane-messages-${event.id}`, event.messages);
        } else {
          const pane = getOrCreatePane(event.id);
          pane.addMessages(event.messages);
        }
        // Send desktop notification for configured pattern groups when window is not focused
        if (
          notificationsPermissionGranted &&
          currentNotificationsConfig.enabled &&
          currentNotificationsConfig.groups.length > 0 &&
          !document.hasFocus()
        ) {
          for (const msg of event.messages) {
            if (currentNotificationsConfig.groups.includes(msg.type)) {
              sendNotification({
                title: `${msg.type.charAt(0).toUpperCase() + msg.type.slice(1)} received`,
                body: msg.text,
                icon: "icons/128x128.png",
              });
            }
          }
        }
        break;
      }
      case "main": {
        mainOutput.addLines(event.lines, event.ansi);
        // Send desktop notifications for configured pattern groups when window is not focused
        if (
          notificationsPermissionGranted &&
          currentNotificationsConfig.enabled &&
          currentNotificationsConfig.groups.length > 0 &&
          event.types &&
          !document.hasFocus()
        ) {
          for (let i = 0; i < event.types.length; i++) {
            const type = event.types[i];
            if (currentNotificationsConfig.groups.includes(type)) {
              sendNotification({
                title: `${type.charAt(0).toUpperCase() + type.slice(1)} received`,
                body: event.lines[i],
                icon: "icons/128x128.png",
              });
            }
          }
        }
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
        // Create pane containers for all enabled panes (skip floating ones)
        for (const paneConfig of event.panes) {
          if (!paneConfig.enabled) continue;
          // Check local config to see if this pane is floating
          const localConfig = currentPanesConfig?.panes.find(p => p.id === paneConfig.id);
          if (localConfig?.position === "floating") continue;
          if (!panes.has(paneConfig.id)) {
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
    currentPanesConfig = newPanesConfig;

    // Track which panes should be docked vs floating
    const dockedPaneIds = new Set<string>();
    const floatingPaneConfigs: PaneConfig[] = [];

    for (const paneConfig of newPanesConfig.panes) {
      if (paneConfig.enabled === false) continue;
      if (paneConfig.position === "floating") {
        floatingPaneConfigs.push(paneConfig);
      } else {
        dockedPaneIds.add(paneConfig.id);
      }
    }

    // Remove docked panes that are now disabled or floating
    for (const [paneId, pane] of panes) {
      if (!dockedPaneIds.has(paneId)) {
        pane.destroy();
        panes.delete(paneId);
      }
    }

    // Close floating windows for panes that are now docked or disabled
    for (const [paneId] of floatingPanes) {
      const config = newPanesConfig.panes.find(p => p.id === paneId);
      if (!config || config.enabled === false || config.position !== "floating") {
        closeFloatingPane(paneId);
      }
    }

    // Add or update docked panes
    for (const paneConfig of newPanesConfig.panes) {
      if (paneConfig.enabled === false || paneConfig.position === "floating") continue;

      const existingPane = panes.get(paneConfig.id);
      if (existingPane) {
        existingPane.setHeightInLines(paneConfig.height);
      } else {
        const pane = new PaneRenderer(panesContainer, {
          id: paneConfig.id,
          title: paneConfig.id.charAt(0).toUpperCase() + paneConfig.id.slice(1),
          height: paneConfig.height,
        });
        panes.set(paneConfig.id, pane);
      }
    }

    // Open floating pane windows
    for (const paneConfig of floatingPaneConfigs) {
      if (!floatingPanes.has(paneConfig.id)) {
        openFloatingPane(paneConfig);
      }
    }
  });

  // Listen for notifications config changes
  listen<NotificationsConfig>("notifications-config-changed", (event) => {
    currentNotificationsConfig = event.payload;
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

  // Check for updates in background (after a short delay to let app settle)
  setTimeout(() => {
    checkForUpdates((msg) => mainOutput.addClientMessage(msg));
  }, 3000);
}

main().catch(console.error);
