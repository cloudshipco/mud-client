/**
 * SearchBar - Search input that appears at top of main output
 */

export interface SearchBarOptions {
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export class SearchBar {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private matchCount: HTMLElement;
  private options: SearchBarOptions;

  constructor(parent: HTMLElement, options: SearchBarOptions) {
    this.options = options;

    this.container = document.createElement("div");
    this.container.className = "search-bar";
    this.container.style.display = "none";

    // Input field
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "search-input";
    this.input.placeholder = "Search...";

    // Match count display
    this.matchCount = document.createElement("span");
    this.matchCount.className = "search-match-count";
    this.matchCount.textContent = "";

    // Navigation buttons
    const prevBtn = document.createElement("button");
    prevBtn.className = "search-nav-btn";
    prevBtn.textContent = "▲";
    prevBtn.title = "Previous match (Shift+Enter)";
    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.options.onPrevious();
    });

    const nextBtn = document.createElement("button");
    nextBtn.className = "search-nav-btn";
    nextBtn.textContent = "▼";
    nextBtn.title = "Next match (Enter)";
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.options.onNext();
    });

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "search-close-btn";
    closeBtn.textContent = "×";
    closeBtn.title = "Close (Escape)";
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.options.onClose();
    });

    // Handle input events
    this.input.addEventListener("input", () => {
      this.options.onSearch(this.input.value);
    });

    // Handle keyboard navigation
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          this.options.onPrevious();
        } else {
          this.options.onNext();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.options.onClose();
      }
    });

    // Assemble the search bar
    this.container.appendChild(this.input);
    this.container.appendChild(this.matchCount);
    this.container.appendChild(prevBtn);
    this.container.appendChild(nextBtn);
    this.container.appendChild(closeBtn);

    parent.appendChild(this.container);
  }

  show(): void {
    this.container.style.display = "flex";
    this.input.focus();
    this.input.select();
  }

  hide(): void {
    this.container.style.display = "none";
    this.input.value = "";
    this.matchCount.textContent = "";
  }

  isVisible(): boolean {
    return this.container.style.display !== "none";
  }

  updateMatchCount(current: number, total: number): void {
    if (total === 0) {
      this.matchCount.textContent = "No matches";
      this.matchCount.classList.add("no-matches");
    } else {
      this.matchCount.textContent = `${current} of ${total}`;
      this.matchCount.classList.remove("no-matches");
    }
  }

  getQuery(): string {
    return this.input.value;
  }

  focus(): void {
    this.input.focus();
  }
}
