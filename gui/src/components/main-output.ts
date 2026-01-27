/**
 * MainOutput - Scrollable main output area
 */

import { ansiToHtml, AnsiState } from "../utils/ansi-parser";

export interface MainOutputOptions {
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
}

export class MainOutput {
  private container: HTMLElement;
  private content: HTMLElement;
  private lines: string[] = [];
  private autoScroll = true;
  private hasNewContent = false;
  private newIndicator: HTMLElement | null = null;
  private ansiState: AnsiState = {}; // Track ANSI state across lines

  constructor(parent: HTMLElement, options: MainOutputOptions = {}) {
    // Create main output container
    this.container = document.createElement("div");
    this.container.className = "main-output";

    // Create scrollable content area
    this.content = document.createElement("div");
    this.content.className = "main-content";
    this.container.appendChild(this.content);

    // Handle scroll events
    this.content.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = this.content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      this.autoScroll = isAtBottom;

      if (isAtBottom) {
        this.hasNewContent = false;
        this.updateNewIndicator();
      }

      if (options.onScroll) {
        options.onScroll(scrollTop, scrollHeight);
      }
    });

    parent.appendChild(this.container);
  }

  addLines(newLines: string[], ansiLines: string[]): void {
    for (let i = 0; i < ansiLines.length; i++) {
      this.lines.push(ansiLines[i]);
      const { html, state } = ansiToHtml(ansiLines[i], this.ansiState);
      this.ansiState = state; // Carry state to next line
      this.renderHtml(html);
    }

    // Limit stored lines
    while (this.lines.length > 1000) {
      this.lines.shift();
      if (this.content.firstChild) {
        this.content.removeChild(this.content.firstChild);
      }
    }

    // Auto-scroll to bottom if enabled
    if (this.autoScroll) {
      this.scrollToBottom();
    } else {
      this.hasNewContent = true;
      this.updateNewIndicator();
    }
  }

  addClientMessage(message: string): void {
    const line = document.createElement("div");
    line.className = "main-line main-line-client";
    const { html } = ansiToHtml(message); // Client messages don't carry state
    line.innerHTML = `<span class="client-prefix">[Client]</span> ${html}`;
    this.content.appendChild(line);

    // Auto-scroll if enabled
    if (this.autoScroll) {
      this.scrollToBottom();
    } else {
      this.hasNewContent = true;
      this.updateNewIndicator();
    }
  }

  private renderHtml(html: string): void {
    const line = document.createElement("div");
    line.className = "main-line";
    line.innerHTML = html;
    this.content.appendChild(line);
  }

  scrollToBottom(): void {
    this.content.scrollTop = this.content.scrollHeight;
    this.autoScroll = true;
    this.hasNewContent = false;
    this.updateNewIndicator();
  }

  /**
   * Called when layout changes (e.g., input area resizes).
   * If auto-scroll was enabled, scroll to bottom to maintain position.
   */
  handleLayoutChange(): void {
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  scrollUp(lines: number = 1): void {
    const lineHeight = 20;
    this.content.scrollTop -= lines * lineHeight;
    this.autoScroll = false;
  }

  scrollDown(lines: number = 1): void {
    const lineHeight = 20;
    this.content.scrollTop += lines * lineHeight;

    // Check if now at bottom
    const { scrollTop, scrollHeight, clientHeight } = this.content;
    if (scrollHeight - scrollTop - clientHeight < 10) {
      this.autoScroll = true;
      this.hasNewContent = false;
      this.updateNewIndicator();
    }
  }

  pageUp(): void {
    this.content.scrollTop -= this.content.clientHeight * 0.9;
    this.autoScroll = false;
  }

  pageDown(): void {
    this.content.scrollTop += this.content.clientHeight * 0.9;

    // Check if now at bottom
    const { scrollTop, scrollHeight, clientHeight } = this.content;
    if (scrollHeight - scrollTop - clientHeight < 10) {
      this.autoScroll = true;
      this.hasNewContent = false;
      this.updateNewIndicator();
    }
  }

  private updateNewIndicator(): void {
    if (this.hasNewContent && !this.autoScroll) {
      if (!this.newIndicator) {
        this.newIndicator = document.createElement("div");
        this.newIndicator.className = "new-indicator";
        this.newIndicator.textContent = "↓ new messages";
        this.newIndicator.addEventListener("click", () => this.scrollToBottom());
        this.container.appendChild(this.newIndicator);
      }
      this.newIndicator.style.display = "block";
    } else if (this.newIndicator) {
      this.newIndicator.style.display = "none";
    }
  }

  clear(): void {
    this.lines = [];
    this.content.innerHTML = "";
    this.hasNewContent = false;
    this.autoScroll = true;
    this.ansiState = {}; // Reset ANSI state on clear
    this.updateNewIndicator();
  }

  focus(): void {
    this.content.focus();
  }
}
