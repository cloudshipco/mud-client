export interface CharacterConfig {
  id: string;
  connectionId: string;
  name: string;
  password?: string;
  aliases: Record<string, string>;
  triggers: TriggerConfig[];
  createdAt: number;
  lastUsedAt: number;
}

export interface TriggerConfig {
  pattern: string;
  action: string;
  enabled: boolean;
}

export function createCharacter(id: string, connectionId: string, name: string, password?: string): CharacterConfig {
  return {
    id,
    connectionId,
    name,
    password,
    aliases: {},
    triggers: [],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
