import { createServer } from 'node:http';
import { route } from './routes.js';
import { readConfig } from './common/config.js';

const config = readConfig();

createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(error) }));
  }
}).listen(config.port, () => {
  console.log(`tool-webfetch-service listening on :${config.port}`);
});
