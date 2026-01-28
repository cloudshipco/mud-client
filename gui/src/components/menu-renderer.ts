/**
 * MenuRenderer - Renders menu dialogs for GUI mode
 */

export interface MenuItem {
  label: string;
  value: string;
  isNew?: boolean;
}

export interface MenuState {
  title: string;
  items: MenuItem[];
  selectedIndex: number;
  showBack: boolean;
  allowDelete: boolean;
}

export class MenuRenderer {
  private container: HTMLElement;
  private menuEl: HTMLElement | null = null;
  private state: MenuState | null = null;
  private onSelect: ((index: number) => void) | null = null;

  constructor(parent: HTMLElement, onSelect?: (index: number) => void) {
    this.container = parent;
    this.onSelect = onSelect || null;
  }

  show(state: MenuState): void {
    console.log("[MenuRenderer] show() called with:", state.title, state.items.length, "items");
    this.state = state;
    this.render();
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this.state = null;
  }

  isVisible(): boolean {
    return this.state !== null;
  }

  getSelectedIndex(): number {
    return this.state?.selectedIndex ?? 0;
  }

  private render(): void {
    if (!this.state) return;

    // Remove existing menu
    if (this.menuEl) {
      this.menuEl.remove();
    }

    // Create menu overlay
    this.menuEl = document.createElement("div");
    this.menuEl.className = "menu-overlay";

    // Create menu box
    const box = document.createElement("div");
    box.className = "menu-box";

    // Title
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = this.state.title;
    box.appendChild(title);

    // Items
    const itemsContainer = document.createElement("div");
    itemsContainer.className = "menu-items";

    this.state.items.forEach((item, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "menu-item";
      if (index === this.state!.selectedIndex) {
        itemEl.classList.add("selected");
      }
      if (item.isNew) {
        itemEl.classList.add("new-item");
      }
      itemEl.textContent = item.label;

      // Add click handler to select this item
      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.onSelect) {
          this.onSelect(index);
        }
      });

      itemsContainer.appendChild(itemEl);
    });

    box.appendChild(itemsContainer);

    // Help text
    const help = document.createElement("div");
    help.className = "menu-help";
    let helpText = "↑/↓ navigate  Enter select";
    if (this.state.allowDelete) {
      helpText += "  d delete";
    }
    if (this.state.showBack) {
      helpText += "  Esc back";
    } else {
      helpText += "  Esc quit";
    }
    help.textContent = helpText;
    box.appendChild(help);

    this.menuEl.appendChild(box);
    this.container.appendChild(this.menuEl);
  }
}
