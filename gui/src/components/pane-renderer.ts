/**
 * PaneRenderer - Renders a single scrollable pane with messages
 * Supports mouse-drag resizing
 */

import { ansiToHtml } from "../utils/ansi-parser";

export interface PaneMessage {
  text: string;
  ansi: string;
  type: string;
  sender?: string;
  channel?: string;
  timestamp: number;
}

export interface PaneRendererOptions {
  id: string;
  title?: string;
  height: number; // Initial height in lines (can be fractional)
  minHeight?: number; // Minimum height in pixels
  onResize?: (paneId: string, newHeight: number) => void;
  isFloating?: boolean; // If true, fills parent and hides resize handle
}

const LINE_HEIGHT = 20; // Approximate pixels per line
const MIN_PANE_HEIGHT = 60; // Minimum height in pixels

export class PaneRenderer {
  private container: HTMLElement;
  private content: HTMLElement;
  private titleEl: HTMLElement;
  private resizeHandle: HTMLElement;
  private id: string;
  private messages: PaneMessage[] = [];
  private autoScroll = true;
  private hasNewContent = false;
  private newIndicator: HTMLElement | null = null;
  private onResize?: (paneId: string, newHeight: number) => void;

  constructor(parent: HTMLElement, options: PaneRendererOptions) {
    this.id = options.id;
    this.onResize = options.onResize;

    // Create pane container
    this.container = document.createElement("div");
    this.container.className = "pane";
    this.container.dataset.paneId = options.id;

    if (options.isFloating) {
      this.container.style.height = "100%";
      this.container.style.borderBottom = "none";
    } else {
      this.container.style.height = `${options.height * LINE_HEIGHT}px`;
    }

    // Create scrollable content area
    this.content = document.createElement("div");
    this.content.className = "pane-content";
    this.container.appendChild(this.content);

    // Add inline title in top right (inside the pane)
    this.titleEl = document.createElement("div");
    this.titleEl.className = "pane-inline-title";
    this.titleEl.textContent = options.title || options.id;
    this.container.appendChild(this.titleEl);

    // Create resize handle at the bottom (skip for floating panes)
    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "pane-resize-handle";
    if (options.isFloating) {
      this.resizeHandle.style.display = "none";
    }
    this.container.appendChild(this.resizeHandle);

    // Handle scroll events
    this.content.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = this.content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      this.autoScroll = isAtBottom;

      if (isAtBottom) {
        this.hasNewContent = false;
        this.updateNewIndicator();
      }
    });

    // Handle resize dragging
    this.setupResizeHandler();

    parent.appendChild(this.container);
  }

  private setupResizeHandler(): void {
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const deltaY = e.clientY - startY;
      const newHeight = Math.max(MIN_PANE_HEIGHT, startHeight + deltaY);
      this.container.style.height = `${newHeight}px`;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // Notify about resize
      if (this.onResize) {
        const finalHeight = this.container.offsetHeight / LINE_HEIGHT;
        this.onResize(this.id, finalHeight);
      }

      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    this.resizeHandle.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      startHeight = this.container.offsetHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  getId(): string {
    return this.id;
  }

  addMessages(newMessages: PaneMessage[]): void {
    for (const msg of newMessages) {
      this.messages.push(msg);
      this.renderMessage(msg);
    }

    // Limit stored messages
    while (this.messages.length > 500) {
      this.messages.shift();
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

  private renderMessage(msg: PaneMessage): void {
    const line = document.createElement("div");
    line.className = `pane-line pane-line-${msg.type}`;
    const { html } = ansiToHtml(msg.ansi); // Each pane message is self-contained
    line.innerHTML = html;

    // Add metadata as data attributes for styling/filtering
    if (msg.sender) {
      line.dataset.sender = msg.sender;
    }
    if (msg.channel) {
      line.dataset.channel = msg.channel;
    }

    this.content.appendChild(line);
  }

  scrollToBottom(): void {
    this.content.scrollTop = this.content.scrollHeight;
    this.autoScroll = true;
    this.hasNewContent = false;
    this.updateNewIndicator();
  }

  scrollUp(lines: number = 1): void {
    const lineHeight = LINE_HEIGHT;
    this.content.scrollTop -= lines * lineHeight;
    this.autoScroll = false;
  }

  scrollDown(lines: number = 1): void {
    const lineHeight = LINE_HEIGHT;
    this.content.scrollTop += lines * lineHeight;

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
        this.newIndicator.className = "pane-new-indicator";
        this.newIndicator.textContent = "↓ new";
        this.newIndicator.addEventListener("click", () => this.scrollToBottom());
        this.container.appendChild(this.newIndicator);
      }
      this.newIndicator.style.display = "block";
    } else if (this.newIndicator) {
      this.newIndicator.style.display = "none";
    }
  }

  setHeight(pixels: number): void {
    this.container.style.height = `${Math.max(MIN_PANE_HEIGHT, pixels)}px`;
  }

  setHeightInLines(lines: number): void {
    this.setHeight(lines * LINE_HEIGHT);
  }

  getHeight(): number {
    return this.container.offsetHeight;
  }

  getHeightInLines(): number {
    return this.container.offsetHeight / LINE_HEIGHT;
  }

  clear(): void {
    this.messages = [];
    this.content.innerHTML = "";
    this.hasNewContent = false;
    this.autoScroll = true;
    this.updateNewIndicator();
  }

  destroy(): void {
    this.container.remove();
  }
}
