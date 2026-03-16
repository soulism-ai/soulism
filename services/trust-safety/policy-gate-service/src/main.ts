import { createServer } from 'node:http';
import { config } from './common/config.js';
import { route } from './routes.js';

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(error) }));
  }
});

server.listen(config.port, () => {
  console.log(`policy-gate-service listening on :${config.port}`);
});
