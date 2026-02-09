/**
 * InputLine - Fixed input area at the bottom
 * Supports multi-line input with Option+Enter to add lines
 */

export type InputMode = 'select' | 'clear';

export interface InputLineOptions {
  onInput: (data: string) => void;
  inputMode?: InputMode;
  onResize?: () => void;
}

const MAX_INPUT_LINES = 10;

export class InputLine {
  private container: HTMLElement;
  private promptEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private onInput: (data: string) => void;
  private passthroughMode = false; // When true, send all keys directly to PTY
  private awaitingCompletion = false; // True after sending tab, waiting for completion response
  private awaitingHistory = false; // True after sending up/down arrow, waiting for history response
  private backendHasText = false; // True when backend's buffer matches our input (after tab/history)
  private inputMode: InputMode = 'select';
  private preserveSelection = false; // When true, ignore backend's empty setText (for select mode)
  private selectTimeoutId: ReturnType<typeof setTimeout> | null = null; // Pending select() timeout
  private historyNavigationActive = false; // True after history navigation, prevents unwanted selection
  private baseLineHeight = 0; // Computed line height for auto-grow
  private onResize?: () => void;
  private lastHeight = 0; // Track height to detect changes

  constructor(parent: HTMLElement, options: InputLineOptions) {
    this.onInput = options.onInput;
    this.inputMode = options.inputMode ?? 'select';
    this.onResize = options.onResize;

    // Create input container
    this.container = document.createElement("div");
    this.container.className = "input-line";

    // Create prompt display
    this.promptEl = document.createElement("span");
    this.promptEl.className = "input-prompt";
    this.promptEl.textContent = "> ";
    this.container.appendChild(this.promptEl);

    // Create textarea for multi-line input
    this.inputEl = document.createElement("textarea");
    this.inputEl.className = "input-field";
    this.inputEl.spellcheck = false;
    this.inputEl.autocomplete = "off";
    this.inputEl.rows = 1;
    this.container.appendChild(this.inputEl);

    // Handle key events
    this.inputEl.addEventListener("keydown", (e) => this.handleKeyDown(e));

    // When user types, clear flags for special modes and auto-grow
    this.inputEl.addEventListener("input", () => {
      if (this.backendHasText) {
        // Mark that backend's buffer is now stale - don't send Ctrl+U here
        // because the backend would respond with empty text and clear our input.
        // The backend will be synced when needed (on Enter or Tab).
        this.backendHasText = false;
      }
      // User is typing, allow backend updates again
      this.preserveSelection = false;
      this.autoGrow();
    });

    parent.appendChild(this.container);

    // Compute line height after element is in DOM and set initial height
    requestAnimationFrame(() => {
      const style = getComputedStyle(this.inputEl);
      const fontSize = parseFloat(style.fontSize);
      // lineHeight might be "normal", a number, or pixels
      const lineHeightStr = style.lineHeight;
      if (lineHeightStr === 'normal') {
        this.baseLineHeight = fontSize * 1.2;
      } else if (lineHeightStr.endsWith('px')) {
        this.baseLineHeight = parseFloat(lineHeightStr);
      } else {
        // Unitless multiplier
        this.baseLineHeight = fontSize * parseFloat(lineHeightStr);
      }
      // Set initial height to exactly 1 line
      this.inputEl.style.height = `${this.baseLineHeight}px`;
    });
  }

  /**
   * Auto-grow textarea to fit content, up to MAX_INPUT_LINES
   */
  private autoGrow(): void {
    const lineHeight = this.baseLineHeight || 20;

    // Count actual newlines in the content
    const newlineCount = (this.inputEl.value.match(/\n/g) || []).length;
    const contentLines = newlineCount + 1; // +1 for the first line
    const clampedLines = Math.min(Math.max(1, contentLines), MAX_INPUT_LINES);

    // Set height based on line count
    const newHeight = clampedLines * lineHeight;
    this.inputEl.style.height = `${newHeight}px`;

    // Notify if height changed (so main output can re-scroll)
    if (newHeight !== this.lastHeight) {
      this.lastHeight = newHeight;
      this.onResize?.();
    }
  }

  /**
   * Enable passthrough mode - all keys sent directly to PTY
   * Use this when menu/prompt dialogs are active
   */
  setPassthroughMode(enabled: boolean): void {
    this.passthroughMode = enabled;
    if (enabled) {
      // Clear local input when entering passthrough mode
      this.inputEl.value = "";
    }
  }

  isPassthroughMode(): boolean {
    return this.passthroughMode;
  }

  // Movement keys for roguelike navigation (must match backend)
  private static MOVEMENT_KEYS = new Set([
    "H", "J", "K", "L", // Cardinal directions
    "Y", "U", "B", "N", // Diagonals
    "<", ">", "{", "}", // Up/down
    ":", // Look
  ]);

  private handleKeyDown(e: KeyboardEvent): void {
    // Allow Cmd+key (macOS) through for native menu accelerators
    // This includes: Cmd+, (settings), Cmd+N (new window), Cmd+W (close), Cmd+Q (quit)
    // Exclude clipboard shortcuts (Cmd+C/V/X/A/Z) which should be handled by input field
    // Note: Ctrl+key is NOT included here - those are terminal control sequences (Ctrl+R, etc.)
    if (e.metaKey && !e.ctrlKey && e.key.length === 1) {
      const key = e.key.toLowerCase();
      if (!['c', 'v', 'x', 'a', 'z'].includes(key)) {
        return; // Let native menu handle it
      }
    }

    // In passthrough mode, send all keys directly to PTY
    if (this.passthroughMode) {
      e.preventDefault();
      e.stopPropagation(); // Prevent global handler from also sending the key
      this.sendKeyToPty(e);
      return;
    }

    // Movement keys: when input is empty OR entirely selected, send immediately
    // to let the backend's movementKeys setting handle them.
    // This allows movement keys to work in "select text" mode after sending a command.
    const isEntirelySelected = this.inputEl.selectionStart === 0
      && this.inputEl.selectionEnd === this.inputEl.value.length;
    if ((this.inputEl.value.length === 0 || isEntirelySelected) && InputLine.MOVEMENT_KEYS.has(e.key)) {
      e.preventDefault();
      this.onInput(e.key);
      return;
    }

    // Normal mode: handle input locally, send commands on Enter
    if (e.key === "Enter") {
      // Option+Enter (Alt+Enter on Mac) inserts a newline without sending
      if (e.altKey) {
        // Insert newline at cursor position
        const start = this.inputEl.selectionStart;
        const end = this.inputEl.selectionEnd;
        const value = this.inputEl.value;
        this.inputEl.value = value.substring(0, start) + "\n" + value.substring(end);
        this.inputEl.selectionStart = this.inputEl.selectionEnd = start + 1;
        this.autoGrow();
        e.preventDefault();
        return;
      }

      e.preventDefault();
      // Clear history navigation state - we're sending a new command
      this.historyNavigationActive = false;
      if (this.backendHasText) {
        // Backend already has the text (e.g., after tab completion), just send Enter
        this.onInput("\r");
      } else {
        // Clear backend's buffer first, then send full text
        // This ensures backend is in sync (e.g., after using history then clearing input)
        this.onInput("\x15" + this.inputEl.value + "\r");
      }
      // Apply inputMode setting: select text or clear input
      // Ignore backend text updates until next user input
      this.preserveSelection = true;
      if (this.inputMode === 'select') {
        // Use setTimeout to select after backend events are processed
        // Store timeout ID so we can cancel it if user navigates history
        this.selectTimeoutId = setTimeout(() => {
          this.selectTimeoutId = null;
          this.inputEl.focus();
          this.inputEl.select();
        }, 20);
      } else {
        this.inputEl.value = "";
      }
      this.backendHasText = false;
      // Reset height after clearing/selecting
      this.autoGrow();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.onInput("\x1b");
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Send current input + tab for completion
      if (!this.backendHasText) {
        this.onInput(this.inputEl.value + "\t");
      } else {
        // Backend already has text, just send tab
        this.onInput("\t");
      }
      this.awaitingCompletion = true;
    } else if (e.key === "Backspace") {
      // Check if entire text is selected - if so after history navigation,
      // this is unexpected and we should prevent deleting everything
      const hasFullSelection = this.inputEl.selectionStart === 0
        && this.inputEl.selectionEnd === this.inputEl.value.length
        && this.inputEl.value.length > 0;

      if (hasFullSelection && this.historyNavigationActive) {
        // After history navigation, we should NOT have selection.
        // If we do, collapse it and delete just one char instead.
        e.preventDefault();
        const text = this.inputEl.value;
        this.inputEl.value = text.slice(0, -1);
        this.inputEl.setSelectionRange(text.length - 1, text.length - 1);
        // Trigger input event manually since we prevented default
        this.backendHasText = false;
        this.autoGrow();
      } else if (this.inputEl.value.length === 0) {
        // Empty input - send to PTY
        e.preventDefault();
        this.onInput("\x7f");
      }
      // Otherwise let default browser behavior handle it
    } else if (e.key === "ArrowUp") {
      // Only trigger history if cursor is on the first line
      const textBeforeCursor = this.inputEl.value.substring(0, this.inputEl.selectionStart);
      if (!textBeforeCursor.includes('\n')) {
        e.preventDefault();
        // Cancel pending select timeout to prevent selecting history text
        if (this.selectTimeoutId) {
          clearTimeout(this.selectTimeoutId);
          this.selectTimeoutId = null;
        }
        // Mark that we're navigating history - selection should not occur
        this.historyNavigationActive = true;
        // Collapse any existing selection immediately (e.preventDefault stops browser from doing this)
        // This prevents backspace from deleting all text if pressed before backend responds
        const cursorPos = this.inputEl.selectionEnd;
        this.inputEl.setSelectionRange(cursorPos, cursorPos);
        this.preserveSelection = false; // Allow history to replace text
        this.awaitingHistory = true; // Backend will have the history text
        this.onInput("\x1b[A");
      }
      // Otherwise let textarea handle cursor movement
    } else if (e.key === "ArrowDown") {
      // Only trigger history if cursor is on the last line
      const textAfterCursor = this.inputEl.value.substring(this.inputEl.selectionStart);
      if (!textAfterCursor.includes('\n')) {
        e.preventDefault();
        // Cancel pending select timeout to prevent selecting history text
        if (this.selectTimeoutId) {
          clearTimeout(this.selectTimeoutId);
          this.selectTimeoutId = null;
        }
        // Mark that we're navigating history - selection should not occur
        this.historyNavigationActive = true;
        // Collapse any existing selection immediately (e.preventDefault stops browser from doing this)
        const cursorPos = this.inputEl.selectionStart;
        this.inputEl.setSelectionRange(cursorPos, cursorPos);
        this.preserveSelection = false; // Allow history to replace text
        this.awaitingHistory = true; // Backend will have the history text
        this.onInput("\x1b[B");
      }
      // Otherwise let textarea handle cursor movement
    } else if (e.key === "ArrowRight") {
      // Let default cursor movement work in input
    } else if (e.key === "ArrowLeft") {
      // Let default cursor movement work in input
    } else if (e.ctrlKey && e.key.length === 1) {
      // Send control sequences (only for single character keys, not "Control" itself)
      const char = e.key.toLowerCase();
      if (char >= "a" && char <= "z") {
        e.preventDefault();
        this.onInput(String.fromCharCode(char.charCodeAt(0) - 96));
      }
    }
  }

  private sendKeyToPty(e: KeyboardEvent): void {
    // Convert keyboard events to terminal escape sequences
    if (e.key === "Enter") {
      this.onInput("\r");
    } else if (e.key === "Escape") {
      this.onInput("\x1b");
    } else if (e.key === "Tab") {
      this.onInput("\t");
    } else if (e.key === "Backspace") {
      this.onInput("\x7f");
    } else if (e.key === "Delete") {
      this.onInput("\x1b[3~");
    } else if (e.key === "ArrowUp") {
      this.onInput("\x1b[A");
    } else if (e.key === "ArrowDown") {
      this.onInput("\x1b[B");
    } else if (e.key === "ArrowRight") {
      this.onInput("\x1b[C");
    } else if (e.key === "ArrowLeft") {
      this.onInput("\x1b[D");
    } else if (e.key === "Home") {
      this.onInput("\x1b[H");
    } else if (e.key === "End") {
      this.onInput("\x1b[F");
    } else if (e.key === "PageUp") {
      this.onInput("\x1b[5~");
    } else if (e.key === "PageDown") {
      this.onInput("\x1b[6~");
    } else if (e.ctrlKey && e.key.length === 1) {
      // Ctrl+letter
      const char = e.key.toLowerCase();
      if (char >= "a" && char <= "z") {
        this.onInput(String.fromCharCode(char.charCodeAt(0) - 96));
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Regular character
      this.onInput(e.key);
    }
  }

  setPrompt(prompt: string): void {
    this.promptEl.textContent = prompt;
  }

  setText(text: string): void {
    // Ignore all backend text updates after sending a command
    // (history navigation clears preserveSelection before sending)
    if (this.preserveSelection) {
      return;
    }
    this.inputEl.value = text;
    this.autoGrow();
    // Mark backendHasText if this is a tab completion or history response
    if (this.awaitingCompletion || this.awaitingHistory) {
      this.backendHasText = true;
      this.awaitingCompletion = false;
      this.awaitingHistory = false;
      // Explicitly ensure no selection after history/completion
      // Belt-and-suspenders: even if something selected text, clear it now
      this.inputEl.setSelectionRange(text.length, text.length);
    }
  }

  setCursor(position: number): void {
    // Don't change cursor if we're preserving selection
    if (this.preserveSelection) {
      return;
    }
    this.inputEl.setSelectionRange(position, position);
  }

  focus(): void {
    this.inputEl.focus();
  }

  getValue(): string {
    return this.inputEl.value;
  }

  clear(): void {
    this.inputEl.value = "";
    this.autoGrow();
  }

  setInputMode(mode: InputMode): void {
    this.inputMode = mode;
    this.preserveSelection = false; // Reset state when mode changes
  }
}
