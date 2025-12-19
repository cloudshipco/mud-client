import { describe, test, expect, beforeEach } from "bun:test";
import { TabCompletion } from "../input/TabCompletion";

describe("TabCompletion", () => {
  let completion: TabCompletion;
  const words = ["goblin", "guard", "gold", "sword", "shield", "skeleton", "staff"];

  beforeEach(() => {
    completion = new TabCompletion();
  });

  describe("complete", () => {
    test("completes partial word with shortest match first", () => {
      const result = completion.complete("go", words);
      // gold (4) is shorter than goblin (6)
      expect(result).toBe("gold");
    });

    test("returns input unchanged if no matches", () => {
      const result = completion.complete("xyz", words);
      expect(result).toBe("xyz");
    });

    test("returns input unchanged if empty partial", () => {
      const result = completion.complete("", words);
      expect(result).toBe("");
    });

    test("completes last word in multi-word input", () => {
      const result = completion.complete("kill go", words);
      // gold (4) is shorter than goblin (6)
      expect(result).toBe("kill gold");
    });

    test("prefers shorter matches", () => {
      const result = completion.complete("s", words);
      // staff, shield, skeleton, sword - sorted by length, then alpha
      // staff (5), sword (5), shield (6), skeleton (8)
      expect(result).toBe("staff");
    });

    test("cycles through matches on repeated calls", () => {
      const first = completion.complete("s", words);
      expect(first).toBe("staff");

      // Call again with same input to cycle
      const second = completion.complete("staff", words);
      expect(second).toBe("sword");

      const third = completion.complete("sword", words);
      expect(third).toBe("shield");
    });

    test("is case insensitive", () => {
      const result = completion.complete("GO", words);
      // gold (4) is shorter than goblin (6)
      expect(result).toBe("gold");
    });

    test("does not complete to exact match", () => {
      const result = completion.complete("goblin", words);
      // "goblin" exactly matches, so it should look for other matches starting with "goblin"
      // There are none, so returns unchanged
      expect(result).toBe("goblin");
    });

    test("preserves prefix when completing multi-word input", () => {
      const result = completion.complete("cast fireball at go", words);
      // gold (4) is shorter than goblin (6)
      expect(result).toBe("cast fireball at gold");
    });
  });

  describe("getCompletions", () => {
    test("returns matching completions sorted by length", () => {
      const results = completion.getCompletions("go", words);
      // gold (4) is shorter than goblin (6)
      expect(results).toEqual(["gold", "goblin"]);
    });

    test("returns empty array for short prefix (< 2 chars)", () => {
      const results = completion.getCompletions("g", words);
      expect(results).toEqual([]);
    });

    test("returns empty array for empty prefix", () => {
      const results = completion.getCompletions("", words);
      expect(results).toEqual([]);
    });

    test("is case insensitive", () => {
      const results = completion.getCompletions("GO", words);
      expect(results).toEqual(["gold", "goblin"]);
    });

    test("excludes exact matches", () => {
      // "gold" is an exact match so it's excluded
      // "goblin" doesn't start with "gold" so no matches
      const results = completion.getCompletions("gold", words);
      expect(results).toEqual([]);
    });

    test("limits to 10 results", () => {
      const manyWords = Array.from({ length: 20 }, (_, i) => `sword${i}`);
      const results = completion.getCompletions("sw", manyWords);
      expect(results.length).toBe(10);
    });

    test("sorts by length then alphabetically", () => {
      // Prefix must be at least 2 chars
      const results = completion.getCompletions("sw", words);
      // Only "sword" starts with "sw"
      expect(results).toEqual(["sword"]);
    });

    test("returns multiple matches sorted correctly", () => {
      const results = completion.getCompletions("gu", words);
      // Only "guard" starts with "gu"
      expect(results).toEqual(["guard"]);
    });
  });

  describe("reset", () => {
    test("resets cycling state", () => {
      completion.complete("s", words);
      const cycled = completion.complete("staff", words);
      expect(cycled).toBe("sword");

      completion.reset();

      // After reset, should start fresh
      const fresh = completion.complete("s", words);
      expect(fresh).toBe("staff");
    });
  });
});
