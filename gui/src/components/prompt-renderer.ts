/**
 * PromptRenderer - Renders text prompt dialogs for GUI mode
 */

export interface PromptState {
  title: string;
  label: string;
  value: string;
  isPassword: boolean;
}

export class PromptRenderer {
  private container: HTMLElement;
  private promptEl: HTMLElement | null = null;
  private state: PromptState | null = null;

  constructor(parent: HTMLElement) {
    this.container = parent;
  }

  show(state: PromptState): void {
    this.state = state;
    this.render();
  }

  hide(): void {
    if (this.promptEl) {
      this.promptEl.remove();
      this.promptEl = null;
    }
    this.state = null;
  }

  isVisible(): boolean {
    return this.state !== null;
  }

  private render(): void {
    if (!this.state) return;

    // Remove existing prompt
    if (this.promptEl) {
      this.promptEl.remove();
    }

    // Create prompt overlay
    this.promptEl = document.createElement("div");
    this.promptEl.className = "menu-overlay";

    // Create prompt box
    const box = document.createElement("div");
    box.className = "menu-box prompt-box";

    // Title
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = this.state.title;
    box.appendChild(title);

    // Label
    const label = document.createElement("div");
    label.className = "prompt-label";
    label.textContent = this.state.label;
    box.appendChild(label);

    // Value display
    const valueEl = document.createElement("div");
    valueEl.className = "prompt-value";
    valueEl.textContent = this.state.value + "_";
    box.appendChild(valueEl);

    // Help text
    const help = document.createElement("div");
    help.className = "menu-help";
    help.textContent = "Enter submit  Esc cancel";
    box.appendChild(help);

    this.promptEl.appendChild(box);
    this.container.appendChild(this.promptEl);
  }
}
