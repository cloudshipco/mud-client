/**
 * InputLine - Fixed input area at the bottom
 */

export type InputMode = 'select' | 'clear';

export interface InputLineOptions {
  onInput: (data: string) => void;
  inputMode?: InputMode;
}

export class InputLine {
  private container: HTMLElement;
  private promptEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private onInput: (data: string) => void;
  private passthroughMode = false; // When true, send all keys directly to PTY
  private awaitingCompletion = false; // True after sending tab, waiting for completion response
  private backendHasText = false; // True when backend's buffer matches our input (after tab completion)
  private inputMode: InputMode = 'select';
  private preserveSelection = false; // When true, ignore backend's empty setText (for select mode)

  constructor(parent: HTMLElement, options: InputLineOptions) {
    this.onInput = options.onInput;
    this.inputMode = options.inputMode ?? 'select';

    // Create input container
    this.container = document.createElement("div");
    this.container.className = "input-line";

    // Create prompt display
    this.promptEl = document.createElement("span");
    this.promptEl.className = "input-prompt";
    this.promptEl.textContent = "> ";
    this.container.appendChild(this.promptEl);

    // Create hidden input for keyboard capture
    // We use a text input to get proper keyboard handling
    this.inputEl = document.createElement("input");
    this.inputEl.type = "text";
    this.inputEl.className = "input-field";
    this.inputEl.spellcheck = false;
    this.inputEl.autocomplete = "off";
    this.container.appendChild(this.inputEl);

    // Handle key events
    this.inputEl.addEventListener("keydown", (e) => this.handleKeyDown(e));

    // When user types, clear flags for special modes
    this.inputEl.addEventListener("input", () => {
      if (this.backendHasText) {
        // Clear backend's line since user is editing
        this.onInput("\x15");
        this.backendHasText = false;
      }
      // User is typing, allow backend updates again
      this.preserveSelection = false;
    });

    parent.appendChild(this.container);
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
    // In passthrough mode, send all keys directly to PTY
    if (this.passthroughMode) {
      e.preventDefault();
      e.stopPropagation(); // Prevent global handler from also sending the key
      this.sendKeyToPty(e);
      return;
    }

    // Movement keys: when input is empty, send immediately to let the
    // backend's movementKeys setting handle them.
    if (this.inputEl.value.length === 0 && InputLine.MOVEMENT_KEYS.has(e.key)) {
      e.preventDefault();
      this.onInput(e.key);
      return;
    }

    // Normal mode: handle input locally, send commands on Enter
    if (e.key === "Enter") {
      e.preventDefault();
      if (this.backendHasText) {
        // Backend already has the text (e.g., after tab completion), just send Enter
        this.onInput("\r");
      } else {
        this.onInput(this.inputEl.value + "\r");
      }
      // Apply inputMode setting: select text or clear input
      if (this.inputMode === 'select') {
        this.preserveSelection = true; // Ignore backend's empty setText
        // Use setTimeout to select after any pending events are processed
        setTimeout(() => {
          this.inputEl.select();
        }, 0);
      } else {
        this.inputEl.value = "";
      }
      this.backendHasText = false;
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
      // Let default handle it, but also send to PTY if empty
      if (this.inputEl.value.length === 0) {
        e.preventDefault();
        this.onInput("\x7f");
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.preserveSelection = false; // Allow history to replace text
      this.onInput("\x1b[A");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.preserveSelection = false; // Allow history to replace text
      this.onInput("\x1b[B");
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
    // In select mode, ignore backend updates that would clear or repeat the selected text
    if (this.preserveSelection) {
      if (text === '' || text === this.inputEl.value) {
        return; // Keep the selected text
      }
      // Different non-empty text (e.g., history navigation) - allow it
      this.preserveSelection = false;
    }
    this.inputEl.value = text;
    // Only mark backendHasText if this is a tab completion response
    if (this.awaitingCompletion) {
      this.backendHasText = true;
      this.awaitingCompletion = false;
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
  }

  setInputMode(mode: InputMode): void {
    this.inputMode = mode;
  }
}
