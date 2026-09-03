import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const candidate = normalize(join(root, requested));
  if (!candidate.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const body = await readFile(candidate);
    response.writeHead(200, { 'Content-Type': types[extname(candidate)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}).listen(port, () => console.log(`Magazine Rack web preview: http://localhost:${port}`));
