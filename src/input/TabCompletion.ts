export class TabCompletion {
  private lastInput = "";
  private lastMatches: string[] = [];
  private matchIndex = 0;

  /**
   * Complete the current input using available words
   */
  complete(input: string, words: string[]): string {
    const trimmed = input.trimEnd();
    const lastSpaceIndex = trimmed.lastIndexOf(" ");
    const prefix = lastSpaceIndex >= 0 ? trimmed.slice(0, lastSpaceIndex + 1) : "";
    const partial = lastSpaceIndex >= 0 ? trimmed.slice(lastSpaceIndex + 1) : trimmed;

    if (!partial) {
      return input;
    }

    // Check if we're cycling through matches
    if (input === this.lastInput && this.lastMatches.length > 0) {
      // Cycle to next match
      this.matchIndex = (this.matchIndex + 1) % this.lastMatches.length;
      const match = this.lastMatches[this.matchIndex];
      this.lastInput = prefix + match;
      return this.lastInput;
    }

    // Find new matches
    const lowerPartial = partial.toLowerCase();
    const matches = words
      .filter((word) => word.toLowerCase().startsWith(lowerPartial) && word.toLowerCase() !== lowerPartial)
      .sort((a, b) => {
        // Sort by length (prefer shorter matches) then alphabetically
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
      });

    if (matches.length === 0) {
      return input;
    }

    // Use first match
    this.lastMatches = matches;
    this.matchIndex = 0;
    this.lastInput = prefix + matches[0];

    return this.lastInput;
  }

  /**
   * Reset completion state (call when input changes)
   */
  reset(): void {
    this.lastInput = "";
    this.lastMatches = [];
    this.matchIndex = 0;
  }

  /**
   * Get all completions for a prefix (for ghost text display)
   */
  getCompletions(prefix: string, words: string[]): string[] {
    if (!prefix || prefix.length < 2) {
      return [];
    }

    const lowerPrefix = prefix.toLowerCase();
    return words
      .filter((word) => word.toLowerCase().startsWith(lowerPrefix) && word.toLowerCase() !== lowerPrefix)
      .sort((a, b) => {
        // Sort by length (prefer shorter matches) then alphabetically
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
      })
      .slice(0, 10); // Limit to top 10 completions
  }
}
