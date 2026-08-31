import { pathToFileURL } from 'node:url';
import { createScribblyServer } from './create-server.js';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT) || 3001;
  const server = createScribblyServer();
  server
    .start(port, '0.0.0.0')
    .then((activePort) => console.log(`Scribbly server listening on http://0.0.0.0:${activePort}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export { createScribblyServer } from './create-server.js';
