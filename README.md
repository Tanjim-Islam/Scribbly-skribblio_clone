# Scribbly

Scribbly is a small real-time multiplayer drawing and guessing game. Create a room, share its six-character code, draw with friends, and compete over a fixed number of rounds.

## Stack

- React, TypeScript, Vite, and Tailwind CSS 4
- Native HTML Canvas with Pointer Events
- Node.js, Express, and Socket.IO
- Vitest, React Testing Library, and real Socket.IO test clients

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Installation

```bash
npm install
```

## Development

Start the Vite client and realtime server together:

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies Socket.IO and `/health` to the Node server on port 3001.

## Testing

```bash
npm run test
npm run test:e2e
npm run check
```

`npm run test` runs unit, React, and Socket.IO integration tests. `npm run test:e2e` plays a complete two-round, three-player game against an actual server. `npm run check` runs linting, type checking, all automated tests, and the production build.

## Production build

```bash
npm run build
npm run start
```

The production server listens on `http://127.0.0.1:3001` by default. Set `PORT` to change it.

## Architecture

```text
React and Vite client
        ↕ Socket.IO
Node realtime server
        ↓
in-memory rooms and game state
```

The server owns room membership, hosts, game settings, words, timers, drawing permissions, guesses, scores, and turn progression. Public room payloads are built explicitly and never contain the active secret word. Only the drawer receives private word events.

## Persistence

Rooms and game state intentionally live only in server memory and disappear when the server restarts. The most recently used nickname, stored as `scribbly:nickname`, is the only browser-persisted value.

There are no accounts, database, room history, or mid-game joining in this version.
