import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';

export type ScribblySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ScribblySocket | null = null;

const socketUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;

export function getSocket(): ScribblySocket {
  if (!socket) {
    socket = io(socketUrl || undefined, { autoConnect: true });
  }
  return socket;
}
