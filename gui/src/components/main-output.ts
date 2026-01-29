/**
 * MainOutput - Scrollable main output area
 */

import { ansiToHtml, AnsiState, stripAnsi } from "../utils/ansi-parser";
import { SearchBar } from "./search-bar";

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

  // Search state
  private searchBar: SearchBar;
  private searchMatches: { lineIndex: number; charIndex: number }[] = [];
  private currentMatchIndex = -1;
  private originalLineContents: Map<number, string> = new Map();

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

    // Create search bar
    this.searchBar = new SearchBar(this.container, {
      onSearch: (query) => this.search(query),
      onNext: () => this.nextMatch(),
      onPrevious: () => this.previousMatch(),
      onClose: () => this.hideSearch(),
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

  // Search functionality
  showSearch(): void {
    this.searchBar.show();
  }

  hideSearch(): void {
    this.searchBar.hide();
    this.clearHighlights();
    this.searchMatches = [];
    this.currentMatchIndex = -1;
  }

  isSearchVisible(): boolean {
    return this.searchBar.isVisible();
  }

  private search(query: string): void {
    this.clearHighlights();
    this.searchMatches = [];
    this.currentMatchIndex = -1;

    if (!query) {
      this.searchBar.updateMatchCount(0, 0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const lineElements = this.content.querySelectorAll(".main-line");

    lineElements.forEach((lineEl, lineIndex) => {
      // Get the plain text content (strips HTML tags but preserves displayed text)
      const lineText = lineEl.textContent || "";
      const strippedText = stripAnsi(lineText);
      const lowerText = strippedText.toLowerCase();

      let searchStart = 0;
      let charIndex = lowerText.indexOf(lowerQuery, searchStart);

      while (charIndex !== -1) {
        this.searchMatches.push({ lineIndex, charIndex });
        searchStart = charIndex + 1;
        charIndex = lowerText.indexOf(lowerQuery, searchStart);
      }
    });

    // Highlight all matches
    this.highlightMatches(query);

    // Update match count and go to first match
    if (this.searchMatches.length > 0) {
      this.currentMatchIndex = 0;
      this.updateCurrentHighlight();
      this.scrollToMatch(0);
      this.searchBar.updateMatchCount(1, this.searchMatches.length);
    } else {
      this.searchBar.updateMatchCount(0, 0);
    }
  }

  private highlightMatches(query: string): void {
    const lineElements = this.content.querySelectorAll(".main-line");

    lineElements.forEach((lineEl, lineIndex) => {
      const matchesInLine = this.searchMatches.filter(m => m.lineIndex === lineIndex);
      if (matchesInLine.length === 0) return;

      // Store original HTML content for restoration
      if (!this.originalLineContents.has(lineIndex)) {
        this.originalLineContents.set(lineIndex, lineEl.innerHTML);
      }

      // Work with text content for searching
      const textContent = lineEl.textContent || "";
      const strippedText = stripAnsi(textContent);

      // Build highlighted HTML by processing text nodes
      this.highlightTextNodes(lineEl as HTMLElement, query);
    });
  }

  private highlightTextNodes(element: HTMLElement, query: string): void {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];

    let node: Text | null;
    while ((node = walker.nextNode() as Text)) {
      textNodes.push(node);
    }

    const lowerQuery = query.toLowerCase();

    textNodes.forEach(textNode => {
      const text = textNode.textContent || "";
      const lowerText = text.toLowerCase();

      if (!lowerText.includes(lowerQuery)) return;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let index = lowerText.indexOf(lowerQuery, lastIndex);

      while (index !== -1) {
        // Add text before match
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
        }

        // Add highlighted match
        const mark = document.createElement("mark");
        mark.className = "search-match";
        mark.textContent = text.slice(index, index + query.length);
        fragment.appendChild(mark);

        lastIndex = index + query.length;
        index = lowerText.indexOf(lowerQuery, lastIndex);
      }

      // Add remaining text
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    });
  }

  private clearHighlights(): void {
    // Restore original line contents
    const lineElements = this.content.querySelectorAll(".main-line");
    this.originalLineContents.forEach((originalHtml, lineIndex) => {
      if (lineElements[lineIndex]) {
        lineElements[lineIndex].innerHTML = originalHtml;
      }
    });
    this.originalLineContents.clear();
  }

  private updateCurrentHighlight(): void {
    // Remove current highlight from all
    const allMarks = this.content.querySelectorAll(".search-match");
    allMarks.forEach(mark => mark.classList.remove("search-match-current"));

    if (this.currentMatchIndex < 0 || this.searchMatches.length === 0) return;

    // Find and highlight the current match
    const match = this.searchMatches[this.currentMatchIndex];
    const lineElements = this.content.querySelectorAll(".main-line");
    const lineEl = lineElements[match.lineIndex];
    if (!lineEl) return;

    // Count marks in this line up to our charIndex
    const marks = lineEl.querySelectorAll(".search-match");
    const matchesInLine = this.searchMatches.filter(m => m.lineIndex === match.lineIndex);
    const indexInLine = matchesInLine.findIndex(m => m === match);

    if (indexInLine >= 0 && marks[indexInLine]) {
      marks[indexInLine].classList.add("search-match-current");
    }
  }

  private scrollToMatch(matchIndex: number): void {
    if (matchIndex < 0 || matchIndex >= this.searchMatches.length) return;

    const match = this.searchMatches[matchIndex];
    const lineElements = this.content.querySelectorAll(".main-line");
    const lineEl = lineElements[match.lineIndex] as HTMLElement;

    if (lineEl) {
      // Temporarily disable auto-scroll
      this.autoScroll = false;
      lineEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  nextMatch(): void {
    if (this.searchMatches.length === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
    this.updateCurrentHighlight();
    this.scrollToMatch(this.currentMatchIndex);
    this.searchBar.updateMatchCount(this.currentMatchIndex + 1, this.searchMatches.length);
  }

  previousMatch(): void {
    if (this.searchMatches.length === 0) return;

    this.currentMatchIndex = this.currentMatchIndex <= 0
      ? this.searchMatches.length - 1
      : this.currentMatchIndex - 1;
    this.updateCurrentHighlight();
    this.scrollToMatch(this.currentMatchIndex);
    this.searchBar.updateMatchCount(this.currentMatchIndex + 1, this.searchMatches.length);
  }
}
