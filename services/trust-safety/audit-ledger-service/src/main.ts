import { createServer } from 'node:http';
import { route } from './routes.js';
import { config } from './common/config.js';

createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(error) }));
  }
}).listen(config.port, () => {
  console.log(`audit-ledger-service listening on :${config.port}`);
});
