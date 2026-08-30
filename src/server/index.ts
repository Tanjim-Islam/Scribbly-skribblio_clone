import { pathToFileURL } from 'node:url';
import { createScribblyServer } from './create-server.js';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT) || 3001;
  const server = createScribblyServer();
  server
    .start(port, '127.0.0.1')
    .then((activePort) => console.log(`Scribbly server listening on http://127.0.0.1:${activePort}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export { createScribblyServer } from './create-server.js';
