import type { FrecencyStore } from "./FrecencyStore";

export interface WordWithTimestamp {
  word: string;
  timestamp: number;
}

/**
 * Calculate a frecency score for a word based on recency and frequency.
 * Higher scores rank higher in completion results.
 */
function calculateFrecencyScore(timestamp: number, acceptanceCount: number): number {
  const now = Date.now();
  const ageMinutes = (now - timestamp) / (1000 * 60);

  // Recency decay: halves every 10 minutes
  // This strongly favors words from recent output
  const recencyScore = Math.pow(0.5, ageMinutes / 10);

  // Frequency: logarithmic scaling, but only kicks in after 2+ acceptances
  // This prevents a single acceptance from overriding recency
  const frequencyScore = acceptanceCount >= 2 ? Math.log2(acceptanceCount) : 0;

  // Combined: recency weighted more heavily for immediate context
  return recencyScore * 3 + frequencyScore;
}

/**
 * Tab completion with cycling support.
 * Cycles through matches and back to the original input.
 */
export class TabCompletion {
  private originalInput = "";
  private lastInput = "";
  private lastMatches: string[] = [];
  private matchIndex = -1; // -1 means showing original
  private lastCompletedWord: string | null = null;

  /**
   * Get the last word that was completed (for tracking acceptance)
   */
  getLastCompletedWord(): string | null {
    return this.lastCompletedWord;
  }

  /**
   * Clear the last completed word after it's been recorded
   */
  clearLastCompletedWord(): void {
    this.lastCompletedWord = null;
  }

  /**
   * Complete the last word in the input using available words.
   * Repeatedly calling with the same completed input cycles through matches,
   * then back to the original input.
   *
   * @param input - Current input string
   * @param words - Available words with timestamps (Map<word, timestamp>) or string[]
   * @param frecencyStore - Optional frecency store for frequency-based scoring
   */
  complete(
    input: string,
    words: Map<string, number> | string[],
    frecencyStore?: FrecencyStore
  ): string {
    const trimmed = input.trimEnd();
    const lastSpaceIndex = trimmed.lastIndexOf(" ");
    const prefix = lastSpaceIndex >= 0 ? trimmed.slice(0, lastSpaceIndex + 1) : "";
    const partial = lastSpaceIndex >= 0 ? trimmed.slice(lastSpaceIndex + 1) : trimmed;

    if (!partial) {
      return input;
    }

    // Check if we're cycling through matches
    if (input === this.lastInput && this.lastMatches.length > 0) {
      this.matchIndex++;
      if (this.matchIndex >= this.lastMatches.length) {
        // Cycle back to original
        this.matchIndex = -1;
        this.lastInput = this.originalInput;
        this.lastCompletedWord = null;
        return this.originalInput;
      }
      const match = this.lastMatches[this.matchIndex];
      this.lastInput = prefix + match;
      this.lastCompletedWord = match;
      return this.lastInput;
    }

    // Find new matches
    const lowerPartial = partial.toLowerCase();

    let matches: string[];

    if (words instanceof Map && frecencyStore) {
      // Frecency-based sorting
      const now = Date.now();
      const matchesWithScores = Array.from(words.entries())
        .filter(([word]) => word.toLowerCase().startsWith(lowerPartial) && word.toLowerCase() !== lowerPartial)
        .map(([word, timestamp]) => ({
          word,
          score: calculateFrecencyScore(timestamp, frecencyStore.getAcceptanceCount(word)),
        }))
        .sort((a, b) => b.score - a.score);

      matches = matchesWithScores.map((m) => m.word);
    } else {
      // Legacy: simple array of words, sort by length then alphabetically
      const wordArray = words instanceof Map ? Array.from(words.keys()) : words;
      matches = wordArray
        .filter((word) => word.toLowerCase().startsWith(lowerPartial) && word.toLowerCase() !== lowerPartial)
        .sort((a, b) => {
          if (a.length !== b.length) return a.length - b.length;
          return a.localeCompare(b);
        });
    }

    if (matches.length === 0) {
      return input;
    }

    // Store original and start with first match
    this.originalInput = input;
    this.lastMatches = matches;
    this.matchIndex = 0;
    this.lastInput = prefix + matches[0];
    this.lastCompletedWord = matches[0];

    return this.lastInput;
  }

  /**
   * Cycle through a fixed list of options.
   * Returns the next option, cycling back to original after exhausting all options.
   *
   * @param prefix - The fixed prefix before the cycling part (e.g., "/set ")
   * @param options - Available options to cycle through
   * @param current - Current value being completed/cycled
   * @param fullInput - The complete current input string
   */
  cycle(prefix: string, options: string[], current: string, fullInput: string): string {
    // Check if we're continuing a cycle
    if (fullInput === this.lastInput && this.lastMatches.length > 0) {
      this.matchIndex++;
      if (this.matchIndex >= this.lastMatches.length) {
        // Cycle back to original
        this.matchIndex = -1;
        this.lastInput = this.originalInput;
        return this.originalInput;
      }
      const match = this.lastMatches[this.matchIndex];
      this.lastInput = prefix + match;
      return this.lastInput;
    }

    // Find matching options
    const lowerCurrent = current.toLowerCase();
    let matches: string[];
    let startIndex: number;

    if (current === "") {
      // No current value - show all options
      matches = [...options];
      startIndex = 0;
    } else {
      const exactIndex = options.findIndex((o) => o.toLowerCase() === lowerCurrent);
      if (exactIndex >= 0) {
        // Exact match - start cycling from next option
        matches = [...options];
        startIndex = (exactIndex + 1) % options.length;
      } else {
        // Partial match - filter to matching options
        matches = options.filter((o) => o.toLowerCase().startsWith(lowerCurrent));
        startIndex = 0;
      }
    }

    if (matches.length === 0) {
      return fullInput;
    }

    // Reorder matches to start from startIndex
    if (startIndex > 0 && matches.length === options.length) {
      matches = [...matches.slice(startIndex), ...matches.slice(0, startIndex)];
    }

    // Store original and return first match
    this.originalInput = fullInput;
    this.lastMatches = matches;
    this.matchIndex = 0;
    this.lastInput = prefix + matches[0];

    return this.lastInput;
  }

  /**
   * Reset completion state (call when input changes outside of tab completion)
   */
  reset(): void {
    this.originalInput = "";
    this.lastInput = "";
    this.lastMatches = [];
    this.matchIndex = -1;
    this.lastCompletedWord = null;
  }

  /**
   * Check if currently in a completion cycle
   */
  isActive(): boolean {
    return this.lastMatches.length > 0;
  }
}
