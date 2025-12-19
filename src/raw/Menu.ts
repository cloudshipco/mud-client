// ANSI escape codes
const ESC = "\x1b";
const CSI = `${ESC}[`;
const CLEAR_SCREEN = `${CSI}2J`;
const CURSOR_HOME = `${CSI}H`;
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const CYAN = `${CSI}36m`;
const GREEN = `${CSI}32m`;
const YELLOW = `${CSI}33m`;
const WHITE = `${CSI}37m`;
const BOLD = `${CSI}1m`;
const RESET = `${CSI}0m`;
const INVERSE = `${CSI}7m`;
const CLEAR_LINE = `${CSI}2K`;

export interface MenuItem {
  label: string;
  value: string;
  isNew?: boolean;
}

export type MenuResult =
  | { action: "select"; value: string }
  | { action: "new" }
  | { action: "back" }
  | { action: "quit" }
  | { action: "delete"; value: string };

export class Menu {
  private items: MenuItem[] = [];
  private selectedIndex = 0;
  private title = "";
  private showBack = false;
  private allowDelete = false;
  private resolve: ((result: MenuResult) => void) | null = null;

  show(
    title: string,
    items: MenuItem[],
    options: { showBack?: boolean; showNew?: boolean; newLabel?: string; allowDelete?: boolean } = {}
  ): Promise<MenuResult> {
    this.title = title;
    this.items = [...items];
    this.selectedIndex = 0;
    this.showBack = options.showBack ?? false;
    this.allowDelete = options.allowDelete ?? false;

    if (options.showNew) {
      this.items.push({
        label: options.newLabel || "+ New",
        value: "__new__",
        isNew: true,
      });
    }

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.render();
    });
  }

  handleKey(key: string): boolean {
    if (!this.resolve) return false;

    // Escape or Ctrl+C
    if (key === "\x1b" || key === "\x03") {
      if (this.showBack) {
        this.finish({ action: "back" });
      } else {
        this.finish({ action: "quit" });
      }
      return true;
    }

    // Enter
    if (key === "\r" || key === "\n") {
      const item = this.items[this.selectedIndex];
      if (item?.isNew) {
        this.finish({ action: "new" });
      } else if (item) {
        this.finish({ action: "select", value: item.value });
      }
      return true;
    }

    // Up arrow
    if (key === "\x1b[A") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.render();
      }
      return true;
    }

    // Down arrow
    if (key === "\x1b[B") {
      if (this.selectedIndex < this.items.length - 1) {
        this.selectedIndex++;
        this.render();
      }
      return true;
    }

    // j/k vim-style navigation
    if (key === "j") {
      if (this.selectedIndex < this.items.length - 1) {
        this.selectedIndex++;
        this.render();
      }
      return true;
    }

    if (key === "k") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.render();
      }
      return true;
    }

    // 'd' or Delete key - delete selected item
    if ((key === "d" || key === "\x1b[3~") && this.allowDelete) {
      const item = this.items[this.selectedIndex];
      if (item && !item.isNew) {
        this.finish({ action: "delete", value: item.value });
      }
      return true;
    }

    return true; // Consume all keys while menu is active
  }

  private render(): void {
    const termWidth = process.stdout.columns || 80;
    const termHeight = process.stdout.rows || 24;

    // Calculate box dimensions
    const maxLabelLen = Math.max(...this.items.map((i) => i.label.length), this.title.length);
    const boxWidth = Math.min(Math.max(maxLabelLen + 6, 40), termWidth - 4);
    const boxHeight = Math.min(this.items.length + 6, termHeight - 4);

    // Center position
    const startX = Math.floor((termWidth - boxWidth) / 2);
    const startY = Math.floor((termHeight - boxHeight) / 2);

    let output = HIDE_CURSOR + CLEAR_SCREEN + CURSOR_HOME;

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

    // Items
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const isSelected = i === this.selectedIndex;
      const label = item.label.slice(0, boxWidth - 6);
      const padding = boxWidth - 4 - label.length;

      if (isSelected) {
        output += `${CYAN}│${RESET} ${INVERSE}${item.isNew ? GREEN : WHITE}${label}${" ".repeat(Math.max(0, padding))}${RESET} ${CYAN}│${RESET}\n`;
      } else {
        output += `${CYAN}│${RESET} ${item.isNew ? GREEN : WHITE}${label}${RESET}${" ".repeat(Math.max(0, padding))} ${CYAN}│${RESET}\n`;
      }
      output += `${CSI}${startX}G`;
    }

    // Bottom border
    output += `${CYAN}└${"─".repeat(boxWidth - 2)}┘${RESET}\n`;
    output += `${CSI}${startX}G`;

    // Help text
    output += `\n${CSI}${startX}G`;
    output += `${CYAN}↑/↓${RESET} navigate  ${CYAN}Enter${RESET} select`;
    if (this.allowDelete) {
      output += `  ${CYAN}d${RESET} delete`;
    }
    if (this.showBack) {
      output += `  ${CYAN}Esc${RESET} back`;
    } else {
      output += `  ${CYAN}Esc${RESET} quit`;
    }

    process.stdout.write(output);
  }

  private finish(result: MenuResult): void {
    const resolve = this.resolve;
    this.resolve = null;
    process.stdout.write(SHOW_CURSOR + CLEAR_SCREEN + CURSOR_HOME);
    resolve?.(result);
  }

  isActive(): boolean {
    return this.resolve !== null;
  }
}
