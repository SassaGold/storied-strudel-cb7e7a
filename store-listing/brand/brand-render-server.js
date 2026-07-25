/* throwaway static server for the asset renderer (file: is blocked in the
 * Playwright MCP browser). Serves the SassaGold tree on :8099 so the render
 * page can pull icons and fonts from both repos. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.js': 'text/javascript', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  // POST /save?name=foo.png — writes the raw body, preserving canvas alpha
  // (element screenshots composite against the page background and lose it)
  if (req.method === 'POST' && req.url.startsWith('/save')) {
    const name = new URL(req.url, 'http://x').searchParams.get('name') || 'out.png';
    if (!/^[\w.-]+$/.test(name)) { res.writeHead(400).end('bad name'); return; }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(path.join(ROOT, name), Buffer.concat(chunks));
      res.writeHead(200).end('saved ' + name);
    });
    return;
  }
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'site-render.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(8099, '127.0.0.1', () => console.log('serving on http://127.0.0.1:8099'));
