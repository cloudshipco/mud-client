import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FrecencyStore } from "../input/FrecencyStore";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("FrecencyStore", () => {
  let store: FrecencyStore;
  let testDbPath: string;

  beforeEach(() => {
    store = new FrecencyStore();
    testDbPath = join(tmpdir(), `frecency-test-${Date.now()}.db`);
  });

  afterEach(() => {
    store.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe("without persistence", () => {
    test("returns 0 for unknown words", () => {
      expect(store.getAcceptanceCount("unknown")).toBe(0);
    });

    test("records acceptance and increments count", () => {
      store.recordAcceptance("sword");
      expect(store.getAcceptanceCount("sword")).toBe(1);

      store.recordAcceptance("sword");
      expect(store.getAcceptanceCount("sword")).toBe(2);
    });

    test("tracks multiple words independently", () => {
      store.recordAcceptance("sword");
      store.recordAcceptance("sword");
      store.recordAcceptance("shield");

      expect(store.getAcceptanceCount("sword")).toBe(2);
      expect(store.getAcceptanceCount("shield")).toBe(1);
    });

    test("is case insensitive", () => {
      store.recordAcceptance("Sword");
      store.recordAcceptance("SWORD");
      store.recordAcceptance("sword");

      expect(store.getAcceptanceCount("sword")).toBe(3);
      expect(store.getAcceptanceCount("SWORD")).toBe(3);
    });

    test("getAllCounts returns all tracked words", () => {
      store.recordAcceptance("sword");
      store.recordAcceptance("shield");
      store.recordAcceptance("sword");

      const counts = store.getAllCounts();
      expect(counts.get("sword")).toBe(2);
      expect(counts.get("shield")).toBe(1);
    });
  });

  describe("with persistence", () => {
    test("persists data to SQLite", () => {
      store.initFromPath(testDbPath);
      store.recordAcceptance("sword");
      store.recordAcceptance("sword");
      store.recordAcceptance("shield");
      store.close();

      // Create a new store and load from same path
      const newStore = new FrecencyStore();
      newStore.initFromPath(testDbPath);

      expect(newStore.getAcceptanceCount("sword")).toBe(2);
      expect(newStore.getAcceptanceCount("shield")).toBe(1);

      newStore.close();
    });

    test("creates directory if it does not exist", () => {
      const nestedPath = join(tmpdir(), `frecency-test-${Date.now()}`, "nested", "frecency.db");
      store.initFromPath(nestedPath);
      store.recordAcceptance("test");
      expect(store.getAcceptanceCount("test")).toBe(1);
      store.close();

      // Clean up
      const fs = require("fs");
      fs.rmSync(join(tmpdir(), `frecency-test-${Date.now()}`), { recursive: true, force: true });
    });
  });
});
