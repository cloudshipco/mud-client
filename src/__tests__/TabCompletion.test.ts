import { describe, test, expect, beforeEach } from "bun:test";
import { TabCompletion } from "../input/TabCompletion";
import { FrecencyStore } from "../input/FrecencyStore";

describe("TabCompletion", () => {
  let completion: TabCompletion;
  const words = ["goblin", "guard", "gold", "sword", "shield", "skeleton", "staff"];

  beforeEach(() => {
    completion = new TabCompletion();
  });

  describe("complete", () => {
    test("completes partial word with shortest match first", () => {
      const result = completion.complete("go", words);
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
      expect(result).toBe("kill gold");
    });

    test("prefers shorter matches", () => {
      const result = completion.complete("s", words);
      // staff (5), sword (5) - alphabetically staff comes first
      expect(result).toBe("staff");
    });

    test("cycles through matches on repeated calls", () => {
      const first = completion.complete("s", words);
      expect(first).toBe("staff");

      const second = completion.complete("staff", words);
      expect(second).toBe("sword");

      const third = completion.complete("sword", words);
      expect(third).toBe("shield");
    });

    test("cycles back to original after all matches", () => {
      // s matches: staff, sword, shield, skeleton
      const first = completion.complete("s", words);
      expect(first).toBe("staff");

      const second = completion.complete("staff", words);
      expect(second).toBe("sword");

      const third = completion.complete("sword", words);
      expect(third).toBe("shield");

      const fourth = completion.complete("shield", words);
      expect(fourth).toBe("skeleton");

      // After all matches, cycle back to original
      const fifth = completion.complete("skeleton", words);
      expect(fifth).toBe("s");
    });

    test("cycles back to original with multi-word input", () => {
      const first = completion.complete("kill go", words);
      expect(first).toBe("kill gold");

      const second = completion.complete("kill gold", words);
      expect(second).toBe("kill goblin");

      // Cycle back to original
      const third = completion.complete("kill goblin", words);
      expect(third).toBe("kill go");
    });

    test("is case insensitive", () => {
      const result = completion.complete("GO", words);
      expect(result).toBe("gold");
    });

    test("does not complete to exact match", () => {
      const result = completion.complete("goblin", words);
      expect(result).toBe("goblin");
    });

    test("preserves prefix when completing multi-word input", () => {
      const result = completion.complete("cast fireball at go", words);
      expect(result).toBe("cast fireball at gold");
    });
  });

  describe("cycle", () => {
    const options = ["prompt", "right", "hidden"];

    test("starts with first option when current is empty", () => {
      const result = completion.cycle("/set status ", options, "", "/set status ");
      expect(result).toBe("/set status prompt");
    });

    test("cycles through all options", () => {
      const first = completion.cycle("/set status ", options, "", "/set status ");
      expect(first).toBe("/set status prompt");

      const second = completion.cycle("/set status ", options, "prompt", "/set status prompt");
      expect(second).toBe("/set status right");

      const third = completion.cycle("/set status ", options, "right", "/set status right");
      expect(third).toBe("/set status hidden");
    });

    test("cycles back to original after all options", () => {
      const first = completion.cycle("/set status ", options, "", "/set status ");
      expect(first).toBe("/set status prompt");

      const second = completion.cycle("/set status ", options, "prompt", "/set status prompt");
      expect(second).toBe("/set status right");

      const third = completion.cycle("/set status ", options, "right", "/set status right");
      expect(third).toBe("/set status hidden");

      // Cycle back to original
      const fourth = completion.cycle("/set status ", options, "hidden", "/set status hidden");
      expect(fourth).toBe("/set status ");
    });

    test("completes partial match", () => {
      const result = completion.cycle("/set status ", options, "pro", "/set status pro");
      expect(result).toBe("/set status prompt");
    });

    test("cycles from partial match back to original", () => {
      // Start with partial "ri" - only "right" matches
      const first = completion.cycle("/set status ", options, "ri", "/set status ri");
      expect(first).toBe("/set status right");

      // Only one match for "ri", so next Tab cycles back to original
      const second = completion.cycle("/set status ", options, "right", "/set status right");
      expect(second).toBe("/set status ri");
    });

    test("returns input unchanged if no matches for partial", () => {
      const result = completion.cycle("/set status ", options, "xyz", "/set status xyz");
      expect(result).toBe("/set status xyz");
    });

    test("handles exact match at start", () => {
      // Starting with exact match "right" should cycle to next
      const first = completion.cycle("/set status ", options, "right", "/set status right");
      expect(first).toBe("/set status hidden");
    });

    test("wraps around from last to first option", () => {
      // Start with "hidden" (last option)
      const first = completion.cycle("/set status ", options, "hidden", "/set status hidden");
      expect(first).toBe("/set status prompt");
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

    test("resets cycle state", () => {
      const options = ["a", "b", "c"];
      completion.cycle("/p ", options, "", "/p ");
      const cycled = completion.cycle("/p ", options, "a", "/p a");
      expect(cycled).toBe("/p b");

      completion.reset();

      // After reset, should start fresh
      const fresh = completion.cycle("/p ", options, "", "/p ");
      expect(fresh).toBe("/p a");
    });
  });

  describe("isActive", () => {
    test("returns false initially", () => {
      expect(completion.isActive()).toBe(false);
    });

    test("returns true after completion", () => {
      completion.complete("s", words);
      expect(completion.isActive()).toBe(true);
    });

    test("returns true after cycle", () => {
      completion.cycle("/p ", ["a", "b"], "", "/p ");
      expect(completion.isActive()).toBe(true);
    });

    test("returns false after reset", () => {
      completion.complete("s", words);
      completion.reset();
      expect(completion.isActive()).toBe(false);
    });
  });

  describe("frecency-based completion", () => {
    let frecencyStore: FrecencyStore;

    beforeEach(() => {
      frecencyStore = new FrecencyStore();
    });

    test("sorts by frecency score when using Map with timestamps", () => {
      const now = Date.now();
      const wordMap = new Map<string, number>([
        ["sword", now - 1000 * 60 * 30], // 30 minutes ago (lower recency)
        ["shield", now - 1000 * 60 * 2], // 2 minutes ago (higher recency)
        ["staff", now - 1000 * 60 * 15], // 15 minutes ago
      ]);

      // With no frequency data, shield should be first (most recent)
      const result = completion.complete("s", wordMap, frecencyStore);
      expect(result).toBe("shield");
    });

    test("single acceptance does not override recency", () => {
      const now = Date.now();
      const wordMap = new Map<string, number>([
        ["sword", now - 1000 * 60 * 10], // 10 minutes ago
        ["shield", now], // just now
      ]);

      // Single acceptance for sword shouldn't beat shield's recency
      frecencyStore.recordAcceptance("sword");

      const result = completion.complete("s", wordMap, frecencyStore);
      expect(result).toBe("shield");
    });

    test("prefers frequently accepted completions over older words", () => {
      const now = Date.now();
      const wordMap = new Map<string, number>([
        ["sword", now], // recent
        ["shield", now], // same recency
        ["staff", now], // same recency
      ]);

      // Record many acceptances for staff (need 2+ for frequency to count)
      for (let i = 0; i < 10; i++) {
        frecencyStore.recordAcceptance("staff");
      }

      // Staff should now be first due to high frequency
      const result = completion.complete("s", wordMap, frecencyStore);
      expect(result).toBe("staff");
    });

    test("very recent words beat older frequently-used words", () => {
      const now = Date.now();
      const wordMap = new Map<string, number>([
        ["sword", now - 1000 * 60 * 30], // 30 minutes ago
        ["shield", now], // just now
      ]);

      // Even with several acceptances, shield (just seen) should win
      for (let i = 0; i < 5; i++) {
        frecencyStore.recordAcceptance("sword");
      }

      const result = completion.complete("s", wordMap, frecencyStore);
      expect(result).toBe("shield");
    });

    test("heavily used words eventually beat recent words", () => {
      const now = Date.now();
      const wordMap = new Map<string, number>([
        ["sword", now - 1000 * 60 * 10], // 10 minutes ago
        ["shield", now], // just now
      ]);

      // With many acceptances, sword should eventually win
      for (let i = 0; i < 15; i++) {
        frecencyStore.recordAcceptance("sword");
      }

      const result = completion.complete("s", wordMap, frecencyStore);
      expect(result).toBe("sword");
    });

    test("falls back to length-based sorting for string arrays", () => {
      // When passing a simple string array, should use legacy sorting
      const result = completion.complete("s", words);
      expect(result).toBe("staff"); // shortest, alphabetically first
    });

    test("tracks last completed word", () => {
      expect(completion.getLastCompletedWord()).toBeNull();

      completion.complete("s", words);
      expect(completion.getLastCompletedWord()).toBe("staff");

      completion.complete("staff", words);
      expect(completion.getLastCompletedWord()).toBe("sword");
    });

    test("clears last completed word on cycle back to original", () => {
      // Complete all s-words
      completion.complete("s", words); // staff
      completion.complete("staff", words); // sword
      completion.complete("sword", words); // shield
      completion.complete("shield", words); // skeleton

      // Cycle back to original
      completion.complete("skeleton", words);
      expect(completion.getLastCompletedWord()).toBeNull();
    });

    test("clears last completed word on reset", () => {
      completion.complete("s", words);
      expect(completion.getLastCompletedWord()).toBe("staff");

      completion.reset();
      expect(completion.getLastCompletedWord()).toBeNull();
    });

    test("clearLastCompletedWord clears the tracked word", () => {
      completion.complete("s", words);
      expect(completion.getLastCompletedWord()).toBe("staff");

      completion.clearLastCompletedWord();
      expect(completion.getLastCompletedWord()).toBeNull();
    });
  });
});
