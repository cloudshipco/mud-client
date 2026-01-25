import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

const term = new Terminal({
  fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  theme: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    cursorAccent: "#1e1e1e",
    selectionBackground: "#264f78",
    black: "#1e1e1e",
    red: "#f44747",
    green: "#6a9955",
    yellow: "#dcdcaa",
    blue: "#569cd6",
    magenta: "#c586c0",
    cyan: "#4ec9b0",
    white: "#d4d4d4",
    brightBlack: "#808080",
    brightRed: "#f44747",
    brightGreen: "#6a9955",
    brightYellow: "#dcdcaa",
    brightBlue: "#569cd6",
    brightMagenta: "#c586c0",
    brightCyan: "#4ec9b0",
    brightWhite: "#ffffff",
  },
  cursorBlink: true,
  allowProposedApi: true,
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const container = document.getElementById("terminal");
if (!container) throw new Error("Terminal container not found");

term.open(container);
fitAddon.fit();

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
