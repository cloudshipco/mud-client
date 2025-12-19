export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  createdAt: number;
  lastUsedAt: number;
}

export function createConnection(id: string, name: string, host: string, port: number): ConnectionConfig {
  return {
    id,
    name,
    host,
    port,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}
