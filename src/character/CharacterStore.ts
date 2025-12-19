import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { CharacterConfig } from "./Character";
import type { ConnectionConfig } from "./Connection";
import { createCharacter, slugify } from "./Character";
import { createConnection } from "./Connection";

export class CharacterStore {
  private baseDir: string;

  constructor() {
    this.baseDir = join(homedir(), ".config", "mud-client");
    this.ensureDir(this.baseDir);
    this.ensureDir(join(this.baseDir, "connections"));
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // === Connection Methods ===

  private getConnectionDir(id: string): string {
    return join(this.baseDir, "connections", id);
  }

  private getConnectionConfigPath(id: string): string {
    return join(this.getConnectionDir(id), "connection.json");
  }

  listConnections(): ConnectionConfig[] {
    const connectionsDir = join(this.baseDir, "connections");
    if (!existsSync(connectionsDir)) {
      return [];
    }

    const dirs = readdirSync(connectionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const connections: ConnectionConfig[] = [];

    for (const id of dirs) {
      const conn = this.loadConnection(id);
      if (conn) {
        connections.push(conn);
      }
    }

    return connections.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  loadConnection(id: string): ConnectionConfig | null {
    const configPath = this.getConnectionConfigPath(id);

    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content) as ConnectionConfig;
    } catch {
      return null;
    }
  }

  saveConnection(connection: ConnectionConfig): void {
    const connDir = this.getConnectionDir(connection.id);
    this.ensureDir(connDir);
    this.ensureDir(join(connDir, "characters"));
    this.ensureDir(join(connDir, "logs"));

    const configPath = this.getConnectionConfigPath(connection.id);
    writeFileSync(configPath, JSON.stringify(connection, null, 2));
  }

  createConnection(name: string, host: string, port: number): ConnectionConfig {
    const baseId = slugify(`${host}-${port}`);

    let id = baseId;
    let counter = 1;
    while (existsSync(this.getConnectionDir(id))) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    const connection = createConnection(id, name, host, port);
    this.saveConnection(connection);
    return connection;
  }

  deleteConnection(id: string): boolean {
    const connDir = this.getConnectionDir(id);
    if (!existsSync(connDir)) {
      return false;
    }

    rmSync(connDir, { recursive: true });
    return true;
  }

  updateConnectionLastUsed(id: string): void {
    const conn = this.loadConnection(id);
    if (conn) {
      conn.lastUsedAt = Date.now();
      this.saveConnection(conn);
    }
  }

  // === Character Methods ===

  private getCharacterPath(connectionId: string, characterId: string): string {
    return join(this.getConnectionDir(connectionId), "characters", `${characterId}.json`);
  }

  private getCharacterHistoryPath(connectionId: string, characterId: string): string {
    return join(this.getConnectionDir(connectionId), "characters", `${characterId}.db`);
  }

  listCharacters(connectionId: string): CharacterConfig[] {
    const charsDir = join(this.getConnectionDir(connectionId), "characters");
    if (!existsSync(charsDir)) {
      return [];
    }

    const files = readdirSync(charsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));

    const characters: CharacterConfig[] = [];

    for (const id of files) {
      const char = this.loadCharacter(connectionId, id);
      if (char) {
        characters.push(char);
      }
    }

    return characters.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  loadCharacter(connectionId: string, characterId: string): CharacterConfig | null {
    const configPath = this.getCharacterPath(connectionId, characterId);

    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content) as CharacterConfig;
    } catch {
      return null;
    }
  }

  saveCharacter(character: CharacterConfig): void {
    const charsDir = join(this.getConnectionDir(character.connectionId), "characters");
    this.ensureDir(charsDir);

    const configPath = this.getCharacterPath(character.connectionId, character.id);
    writeFileSync(configPath, JSON.stringify(character, null, 2));
  }

  createCharacter(connectionId: string, name: string, password?: string): CharacterConfig {
    const baseId = slugify(name);

    let id = baseId;
    let counter = 1;
    while (existsSync(this.getCharacterPath(connectionId, id))) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    const character = createCharacter(id, connectionId, name, password);
    this.saveCharacter(character);
    return character;
  }

  deleteCharacter(connectionId: string, characterId: string): boolean {
    const charPath = this.getCharacterPath(connectionId, characterId);
    const historyPath = this.getCharacterHistoryPath(connectionId, characterId);

    if (!existsSync(charPath)) {
      return false;
    }

    rmSync(charPath);
    if (existsSync(historyPath)) {
      rmSync(historyPath);
    }
    return true;
  }

  updateCharacterLastUsed(connectionId: string, characterId: string): void {
    const char = this.loadCharacter(connectionId, characterId);
    if (char) {
      char.lastUsedAt = Date.now();
      this.saveCharacter(char);
    }
  }

  getHistoryDbPath(connectionId: string, characterId: string): string {
    return this.getCharacterHistoryPath(connectionId, characterId);
  }

  setAlias(connectionId: string, characterId: string, name: string, expansion: string): void {
    const char = this.loadCharacter(connectionId, characterId);
    if (char) {
      char.aliases[name] = expansion;
      this.saveCharacter(char);
    }
  }

  removeAlias(connectionId: string, characterId: string, name: string): void {
    const char = this.loadCharacter(connectionId, characterId);
    if (char) {
      delete char.aliases[name];
      this.saveCharacter(char);
    }
  }
}
