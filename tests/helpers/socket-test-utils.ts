import { io as createClient, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import type {
  ActionResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../src/shared/types.js';
import { createScribblyServer, type ScribblyServer } from '../../src/server/create-server.js';
import type { GameEngineOptions } from '../../src/server/game/engine.js';

export type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function startTestServer(options: GameEngineOptions = {}): Promise<{
  server: ScribblyServer;
  url: string;
}> {
  const server = createScribblyServer(options);
  const port = await server.start(0);
  return { server, url: `http://127.0.0.1:${port}` };
}

export async function connectClient(
  url: string,
  options: Partial<ManagerOptions & SocketOptions> = {},
): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const client: TestClient = createClient(url, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      ...options,
    });
    const timer = setTimeout(() => reject(new Error('Client connection timed out.')), 2_000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function emitAck<T = undefined>(
  client: TestClient,
  event: string,
  ...args: unknown[]
): Promise<ActionResult<T>> {
  return new Promise((resolve) => {
    (client.emit as (...values: unknown[]) => void)(event, ...args, resolve);
  });
}

export function waitForEvent<K extends keyof ServerToClientEvents>(
  client: TestClient,
  event: K,
  predicate: (...args: Parameters<ServerToClientEvents[K]>) => boolean = () => true,
  timeout = 2_000,
): Promise<Parameters<ServerToClientEvents[K]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler as never);
      reject(new Error(`Timed out waiting for ${String(event)}.`));
    }, timeout);
    const handler = (...args: Parameters<ServerToClientEvents[K]>) => {
      if (!predicate(...args)) return;
      clearTimeout(timer);
      client.off(event, handler as never);
      resolve(args);
    };
    client.on(event, handler as never);
  });
}

export async function waitUntil(predicate: () => boolean, timeout = 2_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('Condition timed out.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export async function closeClients(clients: TestClient[]): Promise<void> {
  for (const client of clients) {
    if (client.connected) client.disconnect();
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}
