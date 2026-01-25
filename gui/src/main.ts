import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import "@xterm/xterm/css/xterm.css";

import { loadSettings } from "./services/settings-store";
import { TerminalSettings } from "./types/settings";

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

  settingsWindow = new WebviewWindow('settings', {
    url: 'settings.html',
    title: 'Settings',
    width: 480,
    height: 580,
    resizable: true,
    minimizable: false,
    center: true,
  });

  settingsWindow.once('tauri://destroyed', () => {
    settingsWindow = null;
  });
}

async function main() {
  // Load saved settings before creating terminal
  const settings = await loadSettings();

  const term = new Terminal({
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    fontWeight: settings.fontWeight,
    fontWeightBold: settings.fontWeightBold,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    cursorStyle: settings.cursorStyle,
    cursorBlink: settings.cursorBlink,
    theme: settings.theme,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById("terminal");
  if (!container) throw new Error("Terminal container not found");

  // Apply background color from settings
  document.body.style.background = settings.theme.background;

  term.open(container);
  fitAddon.fit();

  // Listen for settings changes from the settings window
  listen<TerminalSettings>('settings-changed', (event) => {
    const newSettings = event.payload;
    applySettings(term, fitAddon, newSettings);
  });

  // Keyboard shortcut: Cmd/Ctrl + , to open settings
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      openSettings();
    }
  });

  // Track connection info for window title
  let currentCharacter: string | null = null;
  let currentHost: string | null = null;

  function updateWindowTitle() {
    if (currentCharacter && currentHost) {
      invoke("set_window_title", { title: `${currentHost} - ${currentCharacter}` });
    }
  }

  // Set up event listener FIRST, before spawning the PTY
  listen<string>("pty-output", (event) => {
    const data = event.payload;
    term.write(data);

    // Parse for character name: "Character: James"
    const charMatch = data.match(/Character:\s+(\S+)/);
    if (charMatch) {
      currentCharacter = charMatch[1];
      updateWindowTitle();
    }

    // Parse for host: "Connecting to dhmud.org:23..."
    const hostMatch = data.match(/Connecting to\s+([^:\s]+)/);
    if (hostMatch) {
      currentHost = hostMatch[1];
      updateWindowTitle();
    }
  }).then(() => {
    // Now spawn the PTY with correct initial size
    invoke("spawn_pty", { cols: term.cols, rows: term.rows })
      .catch((error) => {
        term.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
      });
  });

  // Send input to PTY
  term.onData((data: string) => {
    invoke("write_to_pty", { data });
  });

  // Handle resize
  const handleResize = () => {
    fitAddon.fit();
    invoke("resize_pty", { cols: term.cols, rows: term.rows });
  };

  window.addEventListener("resize", handleResize);

  // Initial focus
  term.focus();
}

function applySettings(term: Terminal, fitAddon: FitAddon, settings: TerminalSettings) {
  term.options.fontFamily = settings.fontFamily;
  term.options.fontSize = settings.fontSize;
  term.options.fontWeight = settings.fontWeight;
  term.options.fontWeightBold = settings.fontWeightBold;
  term.options.lineHeight = settings.lineHeight;
  term.options.letterSpacing = settings.letterSpacing;
  term.options.cursorStyle = settings.cursorStyle;
  term.options.cursorBlink = settings.cursorBlink;
  term.options.theme = { ...settings.theme };

  document.body.style.background = settings.theme.background;

  fitAddon.fit();
}

main().catch(console.error);
