/**
 * Characters config store service for mud-client character management
 * Reads character and connection data from ~/.config/mud-client/connections/
 */

import { readTextFile, writeTextFile, exists, readDir, remove, mkdir } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';
import type { ColorSchemeName } from '../types/color-schemes';

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  createdAt: number;
  lastUsedAt: number;
}

export interface CharacterConfig {
  id: string;
  connectionId: string;
  name: string;
  password?: string;
  aliases: Record<string, string>;
  triggers: unknown[];
  profileId?: string;
  colorScheme?: ColorSchemeName;
  createdAt: number;
  lastUsedAt: number;
}

export interface ConnectionWithCharacters {
  connection: ConnectionConfig;
  characters: CharacterConfig[];
}

async function getConnectionsDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.config', 'mud-client', 'connections');
}

/**
 * Load all connections with their characters
 */
export async function loadConnectionsWithCharacters(): Promise<ConnectionWithCharacters[]> {
  try {
    const connectionsDir = await getConnectionsDir();
    const dirExists = await exists(connectionsDir);

    if (!dirExists) {
      return [];
    }

    const entries = await readDir(connectionsDir);
    const results: ConnectionWithCharacters[] = [];

    for (const entry of entries) {
      if (entry.isDirectory && entry.name) {
        const connectionId = entry.name;
        const connectionPath = await join(connectionsDir, connectionId, 'connection.json');

        try {
          const connectionExists = await exists(connectionPath);
          if (!connectionExists) continue;

          const connectionContent = await readTextFile(connectionPath);
          const connection = JSON.parse(connectionContent) as ConnectionConfig;

          // Load characters for this connection
          const charactersDir = await join(connectionsDir, connectionId, 'characters');
          const characters: CharacterConfig[] = [];

          try {
            const charDirExists = await exists(charactersDir);
            if (charDirExists) {
              const charEntries = await readDir(charactersDir);

              for (const charEntry of charEntries) {
                if (charEntry.name && charEntry.name.endsWith('.json')) {
                  const charPath = await join(charactersDir, charEntry.name);
                  try {
                    const charContent = await readTextFile(charPath);
                    const character = JSON.parse(charContent) as CharacterConfig;
                    characters.push(character);
                  } catch (e) {
                    console.warn(`Failed to load character ${charEntry.name}:`, e);
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`Failed to load characters for connection ${connectionId}:`, e);
          }

          // Sort characters by lastUsedAt descending
          characters.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

          results.push({ connection, characters });
        } catch (e) {
          console.warn(`Failed to load connection ${connectionId}:`, e);
        }
      }
    }

    // Sort connections by lastUsedAt descending
    results.sort((a, b) => b.connection.lastUsedAt - a.connection.lastUsedAt);

    return results;
  } catch (error) {
    console.warn('Failed to load connections:', error);
    return [];
  }
}

/**
 * Save a character config
 */
export async function saveCharacter(character: CharacterConfig): Promise<void> {
  try {
    const connectionsDir = await getConnectionsDir();
    const charPath = await join(
      connectionsDir,
      character.connectionId,
      'characters',
      `${character.id}.json`
    );
    await writeTextFile(charPath, JSON.stringify(character, null, 2));
  } catch (error) {
    console.error('Failed to save character:', error);
    throw error;
  }
}

/**
 * Delete a character config and associated files
 */
export async function deleteCharacter(connectionId: string, characterId: string): Promise<void> {
  try {
    const connectionsDir = await getConnectionsDir();
    const charPath = await join(connectionsDir, connectionId, 'characters', `${characterId}.json`);

    // Delete the character JSON
    if (await exists(charPath)) {
      await remove(charPath);
    }

    // Also delete the history database if it exists
    const historyDbPath = await join(connectionsDir, connectionId, 'characters', `${characterId}.db`);
    if (await exists(historyDbPath)) {
      await remove(historyDbPath);
    }

    // Delete the frecency database if it exists
    const frecencyDbPath = await join(connectionsDir, connectionId, 'characters', `${characterId}-frecency.db`);
    if (await exists(frecencyDbPath)) {
      await remove(frecencyDbPath);
    }
  } catch (error) {
    console.error('Failed to delete character:', error);
    throw error;
  }
}

/**
 * Generate a connection ID from host and port
 */
function generateConnectionId(host: string, port: number): string {
  return `${host.replace(/[^a-zA-Z0-9-]/g, '-')}-${port}`;
}

/**
 * Create a new connection
 */
export async function createConnection(name: string, host: string, port: number): Promise<ConnectionConfig> {
  const connectionsDir = await getConnectionsDir();
  const id = generateConnectionId(host, port);
  const connectionDir = await join(connectionsDir, id);
  const charactersDir = await join(connectionDir, 'characters');
  const logsDir = await join(connectionDir, 'logs');

  // Create directories
  await mkdir(connectionDir, { recursive: true });
  await mkdir(charactersDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });

  const now = Date.now();
  const connection: ConnectionConfig = {
    id,
    name,
    host,
    port,
    createdAt: now,
    lastUsedAt: now,
  };

  // Save connection.json
  const connectionPath = await join(connectionDir, 'connection.json');
  await writeTextFile(connectionPath, JSON.stringify(connection, null, 2));

  return connection;
}

/**
 * Create a new character for a connection
 */
export async function createCharacter(connectionId: string, name: string, password?: string): Promise<CharacterConfig> {
  const connectionsDir = await getConnectionsDir();
  const charactersDir = await join(connectionsDir, connectionId, 'characters');

  // Ensure characters directory exists
  if (!await exists(charactersDir)) {
    await mkdir(charactersDir, { recursive: true });
  }

  const now = Date.now();
  const id = name.toLowerCase().replace(/[^a-zA-Z0-9-]/g, '-');

  const character: CharacterConfig = {
    id,
    connectionId,
    name,
    password,
    aliases: {},
    triggers: [],
    createdAt: now,
    lastUsedAt: now,
  };

  const charPath = await join(charactersDir, `${id}.json`);
  await writeTextFile(charPath, JSON.stringify(character, null, 2));

  return character;
}

/**
 * Format a timestamp for display
 */
export function formatLastUsed(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}
