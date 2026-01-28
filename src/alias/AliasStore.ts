import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export type AliasMap = Record<string, string>;

export class AliasStore {
  private configPath: string;

  constructor() {
    const baseDir = join(homedir(), ".config", "mud-client");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = join(baseDir, "aliases.json");
  }

  private load(): AliasMap {
    if (!existsSync(this.configPath)) {
      return {};
    }

    try {
      const content = readFileSync(this.configPath, "utf-8");
      return JSON.parse(content) as AliasMap;
    } catch {
      return {};
    }
  }

  private save(aliases: AliasMap): void {
    writeFileSync(this.configPath, JSON.stringify(aliases, null, 2));
  }

  set(name: string, expansion: string): void {
    const aliases = this.load();
    aliases[name] = expansion;
    this.save(aliases);
  }

  remove(name: string): boolean {
    const aliases = this.load();
    if (!(name in aliases)) {
      return false;
    }
    delete aliases[name];
    this.save(aliases);
    return true;
  }

  get(name: string): string | undefined {
    return this.load()[name];
  }

  getAll(): AliasMap {
    return this.load();
  }

  has(name: string): boolean {
    return name in this.load();
  }
}
