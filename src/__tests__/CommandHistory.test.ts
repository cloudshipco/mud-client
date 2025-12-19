import { describe, test, expect, beforeEach } from "bun:test";
import { CommandHistory } from "../input/CommandHistory";

describe("CommandHistory", () => {
  let history: CommandHistory;

  beforeEach(() => {
    history = new CommandHistory();
  });

  describe("add", () => {
    test("adds commands to history", () => {
      history.add("look");
      history.add("north");
      expect(history.getAll()).toEqual(["look", "north"]);
    });

    test("does not add duplicate of last command", () => {
      history.add("look");
      history.add("look");
      expect(history.getAll()).toEqual(["look"]);
    });

    test("allows duplicate if not consecutive", () => {
      history.add("look");
      history.add("north");
      history.add("look");
      expect(history.getAll()).toEqual(["look", "north", "look"]);
    });
  });

  describe("navigation", () => {
    beforeEach(() => {
      history.add("first");
      history.add("second");
      history.add("third");
    });

    test("previous() returns commands in reverse order", () => {
      expect(history.previous()).toBe("third");
      expect(history.previous()).toBe("second");
      expect(history.previous()).toBe("first");
    });

    test("previous() stops at first command", () => {
      history.previous(); // third
      history.previous(); // second
      history.previous(); // first
      expect(history.previous()).toBe("first");
    });

    test("next() moves forward through history", () => {
      history.previous(); // third
      history.previous(); // second
      history.previous(); // first
      expect(history.next()).toBe("second");
      expect(history.next()).toBe("third");
    });

    test("next() returns null at end of history", () => {
      history.previous(); // third
      expect(history.next()).toBe(null);
    });

    test("reset() returns position to end", () => {
      history.previous(); // third
      history.previous(); // second
      history.reset();
      expect(history.previous()).toBe("third");
    });
  });

  describe("getLast", () => {
    test("returns null for empty history", () => {
      expect(history.getLast()).toBe(null);
    });

    test("returns last added command", () => {
      history.add("look");
      history.add("north");
      expect(history.getLast()).toBe("north");
    });
  });

  describe("getByIndex", () => {
    beforeEach(() => {
      history.add("first");
      history.add("second");
      history.add("third");
    });

    test("returns command by 1-based index", () => {
      expect(history.getByIndex(1)).toBe("first");
      expect(history.getByIndex(2)).toBe("second");
      expect(history.getByIndex(3)).toBe("third");
    });

    test("returns null for out of range index", () => {
      expect(history.getByIndex(0)).toBe(null);
      expect(history.getByIndex(4)).toBe(null);
      expect(history.getByIndex(-1)).toBe(null);
    });
  });

  describe("findByPrefix", () => {
    beforeEach(() => {
      history.add("look");
      history.add("look around");
      history.add("north");
      history.add("look at sword");
    });

    test("finds most recent command with prefix", () => {
      expect(history.findByPrefix("look")).toBe("look at sword");
    });

    test("returns null if no match", () => {
      expect(history.findByPrefix("south")).toBe(null);
    });

    test("matches exact prefix", () => {
      expect(history.findByPrefix("nor")).toBe("north");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      history.add("kill goblin");
      history.add("look at goblin");
      history.add("north");
      history.add("kill orc");
    });

    test("finds commands containing pattern", () => {
      const results = history.search("kill");
      expect(results).toEqual(["kill orc", "kill goblin"]);
    });

    test("search is case insensitive", () => {
      const results = history.search("KILL");
      expect(results).toEqual(["kill orc", "kill goblin"]);
    });

    test("returns unique results", () => {
      history.add("kill goblin"); // duplicate
      const results = history.search("goblin");
      expect(results).toEqual(["kill goblin", "look at goblin"]);
    });

    test("returns empty array for no match", () => {
      expect(history.search("dragon")).toEqual([]);
    });
  });

  describe("getAll", () => {
    test("returns copy of history array", () => {
      history.add("look");
      history.add("north");
      const all = history.getAll();
      all.push("modified");
      expect(history.getAll()).toEqual(["look", "north"]);
    });
  });
});
