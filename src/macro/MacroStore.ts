import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Macro, MacroMap } from "./types";

export class MacroStore {
  private macros: MacroMap;
  private configPath: string;

  constructor() {
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "macros.json");
    this.macros = this.load();
  }

  private load(): MacroMap {
    if (!existsSync(this.configPath)) {
      return {};
    }

    try {
      const content = readFileSync(this.configPath, "utf-8");
      return JSON.parse(content) as MacroMap;
    } catch {
      return {};
    }
  }

  private save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.macros, null, 2));
  }

  set(name: string, commands: string[]): void {
    const now = Date.now();
    const existing = this.macros[name];
    this.macros[name] = {
      name,
      commands,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.save();
  }

  get(name: string): Macro | undefined {
    return this.macros[name];
  }

  remove(name: string): boolean {
    if (!(name in this.macros)) {
      return false;
    }
    delete this.macros[name];
    this.save();
    return true;
  }

  has(name: string): boolean {
    return name in this.macros;
  }

  list(): Macro[] {
    return Object.values(this.macros);
  }
}
