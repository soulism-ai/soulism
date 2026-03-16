import { spawn } from 'node:child_process';

const command = process.env.COGPERSONA_SERVER_CMD ?? 'pnpm';
const args = (process.env.COGPERSONA_SERVER_ARGS ?? 'tsx services/mcp/persona-registry-service/src/main.ts').split(' ');

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe']
});

const write = (payload: unknown) => {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
};

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const request = {
  jsonrpc: '2.0',
  id: 'example-1',
  method: 'tools/list',
  params: {}
};

write(request);

setTimeout(() => {
  child.kill('SIGTERM');
}, 3000);
