import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TriggerEngine, PatternGroups } from "../triggers/TriggerEngine";
import { TriggerConfigStore } from "../triggers/TriggerConfigStore";
import type { TriggerDefinition, TriggerAction, TriggersConfig } from "../triggers/TriggerConfigStore";

/** Helper to create expected send action */
const send = (value: string): TriggerAction => ({ type: "send", value });

/** Helper to create a trigger with patternGroups */
const trigger = (
  name: string,
  patternGroups: string[],
  action: string,
  enabled = true,
  conditions?: TriggerDefinition["conditions"]
): TriggerDefinition => ({
  name,
  patternGroups,
  actions: [{ type: "send", value: action }],
  enabled,
  conditions,
});

// Mock TriggerConfigStore to avoid filesystem access
function createMockStore(config: TriggersConfig): TriggerConfigStore {
  const store = Object.create(TriggerConfigStore.prototype) as TriggerConfigStore;
  (store as any)._config = config;
  store.getTriggers = () => [...(store as any)._config.triggers];
  store.getConfig = () => ({
    triggers: [...(store as any)._config.triggers],
  });
  store.reload = () => store.getConfig();
  store.setEnabled = (name: string, enabled: boolean) => {
    const t = (store as any)._config.triggers.find((t: TriggerDefinition) => t.name === name);
    if (!t) return false;
    t.enabled = enabled;
    return true;
  };
  return store;
}

/** Helper to create mock store with legacy inline patterns (for backwards compatibility tests) */
function createMockStoreLegacy(triggers: Array<{
  name: string;
  patterns: string[];
  action?: string;
  actions?: TriggerAction[];
  enabled: boolean;
  conditions?: TriggerDefinition["conditions"];
}>): { store: TriggerConfigStore; patternGroups: PatternGroups } {
  // Convert legacy format: create a pattern group for each trigger
  const patternGroups: PatternGroups = {};
  const newTriggers: TriggerDefinition[] = [];

  for (const t of triggers) {
    const groupName = t.name.toLowerCase().replace(/\s+/g, "-");
    patternGroups[groupName] = t.patterns;
    newTriggers.push({
      name: t.name,
      patternGroups: [groupName],
      actions: t.actions || (t.action ? [{ type: "send", value: t.action }] : []),
      enabled: t.enabled,
      conditions: t.conditions,
    });
  }

  return {
    store: createMockStore({ triggers: newTriggers }),
    patternGroups,
  };
}

describe("TriggerEngine", () => {
  describe("basic pattern matching", () => {
    it("returns action when pattern matches", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "auto-loot",
          patterns: ["^\\w+ is DEAD"],
          action: "get all corpse",
          enabled: true,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([send("get all corpse")]);
    });

    it("returns empty array when pattern does not match", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "auto-loot",
          patterns: ["^\\w+ is DEAD"],
          action: "get all corpse",
          enabled: true,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("You feel sleepy")).toEqual([]);
    });

    it("matches multiple triggers", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "loot",
          patterns: ["is DEAD"],
          action: "get all corpse",
          enabled: true,
        },
        {
          name: "celebrate",
          patterns: ["is DEAD"],
          action: "say woohoo",
          enabled: true,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([
        send("get all corpse"),
        send("say woohoo"),
      ]);
    });
  });

  describe("OR logic for multiple patterns in a group", () => {
    it("matches any pattern in the group", () => {
      const patternGroups: PatternGroups = {
        death: ["^\\w+ is DEAD", "^\\w+ has been slain"],
      };
      const store = createMockStore({
        triggers: [trigger("loot", ["death"], "get all corpse")],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Dragon has been slain")).toEqual([send("get all corpse")]);
      expect(engine.evaluate("Goblin is DEAD")).toEqual([send("get all corpse")]);
    });
  });

  describe("enabled/disabled state", () => {
    it("does not fire disabled triggers", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "auto-loot",
          patterns: ["is DEAD"],
          action: "get all corpse",
          enabled: false,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([]);
    });

    it("runtime disable overrides config", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "auto-loot",
          patterns: ["is DEAD"],
          action: "get all corpse",
          enabled: true,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);
      engine.setEnabled("auto-loot", false);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([]);
    });

    it("runtime enable overrides config", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "auto-loot",
          patterns: ["is DEAD"],
          action: "get all corpse",
          enabled: false,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);
      engine.setEnabled("auto-loot", true);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([send("get all corpse")]);
    });
  });

  describe("conditions", () => {
    it("fires when condition matches (eq)", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "heal-critical",
          patterns: ["^You are (?<status>\\w+)\\."],
          action: "cast heal self",
          enabled: true,
          conditions: [{ capture: "status", operator: "eq", value: "bleeding" }],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("You are bleeding.")).toEqual([send("cast heal self")]);
    });

    it("does not fire when condition fails", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "heal-critical",
          patterns: ["^You are (?<status>\\w+)\\."],
          action: "cast heal self",
          enabled: true,
          conditions: [{ capture: "status", operator: "eq", value: "bleeding" }],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("You are healthy.")).toEqual([]);
    });

    it("supports 'in' operator with array", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "heal-any-wound",
          patterns: ["^You are (?<status>\\w+)\\."],
          action: "cast heal self",
          enabled: true,
          conditions: [{ capture: "status", operator: "in", value: ["bleeding", "stunned", "poisoned"] }],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("You are stunned.")).toEqual([send("cast heal self")]);
      expect(engine.evaluate("You are healthy.")).toEqual([]);
    });

    it("supports numeric comparisons", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "low-hp-warning",
          patterns: ["^HP: (?<hp>\\d+)/"],
          action: "cast heal self",
          enabled: true,
          conditions: [{ capture: "hp", operator: "lt", value: 50 }],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("HP: 30/100")).toEqual([send("cast heal self")]);
      expect(engine.evaluate("HP: 80/100")).toEqual([]);
    });

    it("supports 'contains' operator", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "friend-tell",
          patterns: ["^(?<name>\\w+) tells you"],
          action: "say Hi friend!",
          enabled: true,
          conditions: [{ capture: "name", operator: "contains", value: "Bob" }],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Bobby tells you hello")).toEqual([send("say Hi friend!")]);
      expect(engine.evaluate("Alice tells you hello")).toEqual([]);
    });

    it("supports 'matches' operator for regex", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "numbered-mob",
          patterns: ["^(?<mob>.+) attacks you"],
          action: "flee",
          enabled: true,
          conditions: [{ capture: "mob", operator: "matches", value: "^\\d+" }],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("3.goblin attacks you")).toEqual([send("flee")]);
      expect(engine.evaluate("goblin attacks you")).toEqual([]);
    });

    it("AND logic for multiple conditions", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "specific-heal",
          patterns: ["^HP: (?<hp>\\d+)/(?<max>\\d+)"],
          action: "cast major heal",
          enabled: true,
          conditions: [
            { capture: "hp", operator: "lt", value: 30 },
            { capture: "max", operator: "gte", value: 100 },
          ],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("HP: 20/100")).toEqual([send("cast major heal")]);
      expect(engine.evaluate("HP: 20/50")).toEqual([]); // max too low
      expect(engine.evaluate("HP: 50/100")).toEqual([]); // hp too high
    });

    it("skips empty/invalid conditions", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "test",
          patterns: ["^test"],
          action: "do something",
          enabled: true,
          conditions: [
            { capture: "", operator: "eq", value: "x" }, // empty capture
            { capture: "   ", operator: "eq", value: "y" }, // whitespace capture
          ],
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      // Should still match because empty conditions are skipped
      expect(engine.evaluate("test line")).toEqual([send("do something")]);
    });
  });

  describe("multiple actions", () => {
    it("returns all actions for a matching trigger", () => {
      const patternGroups: PatternGroups = {
        death: ["is DEAD"],
      };
      const store = createMockStore({
        triggers: [{
          name: "loot-and-celebrate",
          patternGroups: ["death"],
          actions: [
            { type: "send", value: "get all corpse" },
            { type: "send", value: "say Victory!" },
          ],
          enabled: true,
        }],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([
        send("get all corpse"),
        send("say Victory!"),
      ]);
    });
  });

  describe("listTriggers", () => {
    it("returns trigger info with effective enabled state", () => {
      const patternGroups: PatternGroups = {
        death: ["is DEAD"],
        login: ["Welcome"],
      };
      const store = createMockStore({
        triggers: [
          trigger("loot", ["death"], "get all"),
          trigger("greet", ["login"], "say hi", false),
        ],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.listTriggers()).toEqual([
        { name: "loot", enabled: true, patternCount: 1 },
        { name: "greet", enabled: false, patternCount: 1 },
      ]);
    });
  });

  describe("reload", () => {
    it("clears runtime overrides on reload", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "test",
          patterns: ["test"],
          action: "do",
          enabled: true,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);
      engine.setEnabled("test", false);
      expect(engine.evaluate("test")).toEqual([]);

      engine.reload();
      expect(engine.evaluate("test")).toEqual([send("do")]);
    });
  });

  describe("updateIfChanged", () => {
    it("recompiles when config changes", () => {
      const patternGroups: PatternGroups = {
        test: ["^test"],
      };
      const store = createMockStore({
        triggers: [trigger("test", ["test"], "original")],
      });
      const engine = new TriggerEngine(store, patternGroups);
      expect(engine.evaluate("test")).toEqual([send("original")]);

      // Modify the config
      const newConfig: TriggersConfig = {
        triggers: [trigger("test", ["test"], "updated")],
      };
      engine.updateIfChanged(newConfig);
      expect(engine.evaluate("test")).toEqual([send("updated")]);
    });
  });

  describe("legacy inline patterns support", () => {
    it("falls back to inline patterns if patternGroups is empty", () => {
      const store = createMockStore({
        triggers: [{
          name: "legacy",
          patternGroups: [],
          patterns: ["^legacy test"],
          actions: [{ type: "send", value: "legacy action" }],
          enabled: true,
        }],
      });
      // No pattern groups provided - should use inline patterns
      const engine = new TriggerEngine(store, {});

      expect(engine.evaluate("legacy test")).toEqual([send("legacy action")]);
    });
  });

  describe("pattern groups", () => {
    it("matches using pattern groups", () => {
      const patternGroups: PatternGroups = {
        combat: ["^\\w+ attacks you", "^You are hit"],
        death: ["^\\w+ is DEAD"],
      };
      const store = createMockStore({
        triggers: [trigger("auto-loot", ["death"], "get all corpse")],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([send("get all corpse")]);
    });

    it("supports multiple pattern groups on one trigger", () => {
      const patternGroups: PatternGroups = {
        death: ["is DEAD"],
        slain: ["has been slain"],
      };
      const store = createMockStore({
        triggers: [trigger("loot", ["death", "slain"], "get all corpse")],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Dragon has been slain")).toEqual([send("get all corpse")]);
      expect(engine.evaluate("Goblin is DEAD")).toEqual([send("get all corpse")]);
    });

    it("allows multiple triggers to share the same pattern group", () => {
      const patternGroups: PatternGroups = {
        death: ["is DEAD"],
      };
      const store = createMockStore({
        triggers: [
          trigger("loot", ["death"], "get all corpse"),
          trigger("celebrate", ["death"], "say woohoo"),
        ],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("Goblin is DEAD")).toEqual([
        send("get all corpse"),
        send("say woohoo"),
      ]);
    });

    it("ignores missing pattern group references", () => {
      const patternGroups: PatternGroups = {
        existing: ["^test"],
      };
      const store = createMockStore({
        triggers: [trigger("test", ["existing", "nonexistent"], "do something")],
      });
      const engine = new TriggerEngine(store, patternGroups);

      // Should still match the existing group
      expect(engine.evaluate("test line")).toEqual([send("do something")]);
      expect(engine.evaluate("nothing")).toEqual([]);
    });

    it("works with conditions on pattern groups", () => {
      const patternGroups: PatternGroups = {
        status: ["^You are (?<status>\\w+)\\."],
      };
      const store = createMockStore({
        triggers: [{
          name: "auto-heal",
          patternGroups: ["status"],
          actions: [{ type: "send", value: "cast heal self" }],
          enabled: true,
          conditions: [
            { capture: "status", operator: "in", value: ["bleeding", "stunned"] },
          ],
        }],
      });
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("You are bleeding.")).toEqual([send("cast heal self")]);
      expect(engine.evaluate("You are healthy.")).toEqual([]);
    });

    it("updates when pattern groups change", () => {
      const store = createMockStore({
        triggers: [trigger("test", ["mygroup"], "action")],
      });
      const engine = new TriggerEngine(store, { mygroup: ["^old"] });

      expect(engine.evaluate("old")).toEqual([send("action")]);
      expect(engine.evaluate("new")).toEqual([]);

      // Update pattern groups
      engine.updatePatternGroups({ mygroup: ["^new"] });

      expect(engine.evaluate("old")).toEqual([]);
      expect(engine.evaluate("new")).toEqual([send("action")]);
    });
  });

  describe("client command actions", () => {
    it("returns /prefixed actions as-is for client command dispatch", () => {
      const { store, patternGroups } = createMockStoreLegacy([
        {
          name: "disable-heal",
          patterns: ["^You feel fully healed"],
          action: "/trigger disable auto-heal",
          enabled: true,
        },
      ]);
      const engine = new TriggerEngine(store, patternGroups);

      expect(engine.evaluate("You feel fully healed")).toEqual([
        send("/trigger disable auto-heal"),
      ]);
    });
  });
});
