import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';
import { GameEngine, type GameEngineOptions } from './game/engine.js';

export type ScribblyServer = {
  app: express.Express;
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  engine: GameEngine;
  start: (port?: number, host?: string) => Promise<number>;
  stop: () => Promise<void>;
};

export function createScribblyServer(options: GameEngineOptions = {}): ScribblyServer {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
    connectionStateRecovery: {
      maxDisconnectionDuration: options.timings?.disconnectGraceMs ?? 5_000,
      skipMiddlewares: true,
    },
    maxHttpBufferSize: 100_000,
  });
  const engine = new GameEngine(io, options);

  app.disable('x-powered-by');
  app.get('/health', (_request, response) => response.json({ ok: true }));

  const clientDirectory = path.resolve(process.cwd(), 'dist');
  app.use(express.static(clientDirectory));
  app.use((request, response, next) => {
    if (request.method === 'GET' && request.accepts('html')) {
      response.sendFile(path.join(clientDirectory, 'index.html'), (error) => {
        if (error) next(error);
      });
      return;
    }
    next();
  });

  io.on('connection', (socket) => engine.attachSocket(socket));

  return {
    app,
    httpServer,
    io,
    engine,
    start: (port = 3001, host = '0.0.0.0') =>
      new Promise<number>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        engine.destroy();
        io.close(() => {
          if (!httpServer.listening) {
            resolve();
            return;
          }
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      }),
  };
}
