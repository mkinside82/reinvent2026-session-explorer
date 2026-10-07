import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('.', import.meta.url));
let root;
try {
  root = await realpath(resolve(appDir, 'dist'));
} catch {
  console.error('Demo build not found. Run `pnpm build` from the repository root first.');
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const candidate = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const contents = await readFile(candidate);
    res.writeHead(200, {
      'Content-Type': types[extname(candidate)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(contents);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(`Demo preview failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT) || 0, '127.0.0.1', () => {
  const address = server.address();
  console.log(`Demo preview: http://127.0.0.1:${address.port}/`);
  console.log('Preview only · no AWS sign-in/API server');
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
