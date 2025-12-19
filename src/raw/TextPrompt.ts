// ANSI escape codes
const ESC = "\x1b";
const CSI = `${ESC}[`;
const CLEAR_SCREEN = `${CSI}2J`;
const CURSOR_HOME = `${CSI}H`;
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const CYAN = `${CSI}36m`;
const YELLOW = `${CSI}33m`;
const WHITE = `${CSI}37m`;
const GRAY = `${CSI}90m`;
const BOLD = `${CSI}1m`;
const RESET = `${CSI}0m`;

export type PromptResult =
  | { action: "submit"; value: string }
  | { action: "cancel" };

export class TextPrompt {
  private title = "";
  private label = "";
  private value = "";
  private defaultValue = "";
  private isPassword = false;
  private resolve: ((result: PromptResult) => void) | null = null;

  show(
    title: string,
    label: string,
    options: { defaultValue?: string; isPassword?: boolean } = {}
  ): Promise<PromptResult> {
    this.title = title;
    this.label = label;
    this.value = options.defaultValue || "";
    this.defaultValue = options.defaultValue || "";
    this.isPassword = options.isPassword ?? false;

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.render();
    });
  }

  handleKey(key: string): boolean {
    if (!this.resolve) return false;

    const code = key.charCodeAt(0);

    // Escape
    if (key === "\x1b") {
      this.finish({ action: "cancel" });
      return true;
    }

    // Enter
    if (key === "\r" || key === "\n") {
      this.finish({ action: "submit", value: this.value });
      return true;
    }

    // Backspace
    if (key === "\x7f" || key === "\b") {
      if (this.value.length > 0) {
        this.value = this.value.slice(0, -1);
        this.render();
      }
      return true;
    }

    // Ctrl+U - clear
    if (key === "\x15") {
      this.value = "";
      this.render();
      return true;
    }

    // Regular printable character
    if (code >= 32 && code < 127) {
      this.value += key;
      this.render();
      return true;
    }

    return true; // Consume all keys while prompt is active
  }

  private render(): void {
    const termWidth = process.stdout.columns || 80;
    const termHeight = process.stdout.rows || 24;

    const boxWidth = Math.min(50, termWidth - 4);
    const boxHeight = 7;

    const startX = Math.floor((termWidth - boxWidth) / 2);
    const startY = Math.floor((termHeight - boxHeight) / 2);

    let output = SHOW_CURSOR + CLEAR_SCREEN + CURSOR_HOME;

    // Move to starting position
    output += `${CSI}${startY};${startX}H`;

    // Draw top border
    output += `${CYAN}┌${"─".repeat(boxWidth - 2)}┐${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Title line
    const titlePadded = ` ${this.title} `;
    const titlePadding = boxWidth - 4 - titlePadded.length;
    output += `${CYAN}│${RESET} ${BOLD}${YELLOW}${titlePadded}${RESET}${" ".repeat(Math.max(0, titlePadding))} ${CYAN}│${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Separator
    output += `${CYAN}├${"─".repeat(boxWidth - 2)}┤${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Label
    const labelPadding = boxWidth - 4 - this.label.length;
    output += `${CYAN}│${RESET} ${WHITE}${this.label}${RESET}${" ".repeat(Math.max(0, labelPadding))} ${CYAN}│${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Input field
    const displayValue = this.isPassword ? "*".repeat(this.value.length) : this.value;
    const inputWidth = boxWidth - 6;
    const inputPadding = inputWidth - displayValue.length;
    output += `${CYAN}│${RESET}  ${WHITE}${displayValue}${RESET}${"_".repeat(Math.max(0, inputPadding))}  ${CYAN}│${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Bottom border
    output += `${CYAN}└${"─".repeat(boxWidth - 2)}┘${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Help text
    output += `\n${CSI}${startX}G`;
    output += `${GRAY}Enter${RESET} submit  ${GRAY}Esc${RESET} cancel`;

    // Position cursor in input field
    const cursorX = startX + 3 + displayValue.length;
    const cursorY = startY + 4;
    output += `${CSI}${cursorY};${cursorX}H`;

    process.stdout.write(output);
  }

  private finish(result: PromptResult): void {
    const resolve = this.resolve;
    this.resolve = null;
    process.stdout.write(CLEAR_SCREEN + CURSOR_HOME);
    resolve?.(result);
  }

  isActive(): boolean {
    return this.resolve !== null;
  }
}
