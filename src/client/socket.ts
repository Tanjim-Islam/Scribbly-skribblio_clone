import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';

export type ScribblySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ScribblySocket | null = null;

export function getSocket(): ScribblySocket {
  if (!socket) {
    socket = io({ autoConnect: true });
  }
  return socket;
}
