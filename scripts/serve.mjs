// Serves kiro-web's web/site plus kiro-pos's app at /app/, exactly like Netlify does for this site (plain files, /dir/ -> /dir/index.html,
// and the /kkc/* -> /lux/* redirect from netlify.toml). Used by the browser tests; no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WEB_SITE, POS_APP } from './workspace.mjs';

const root = WEB_SITE;
const port = Number(process.env.QA_PORT || 5190);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/kkc/')) { res.writeHead(301, { Location: '/lux/' + url.pathname.slice(5) }); return res.end(); }
  if (url.pathname === '/favicon.ico') url.pathname = '/favicon.png'; // same rewrite as netlify.toml
  // /app/ is the POS app from kiro-pos (on Netlify it is downloaded at the pinned tag into web/site/app).
  const base = url.pathname.startsWith('/app/') && fs.existsSync(POS_APP) ? POS_APP : root;
  const rel = base === root ? url.pathname : url.pathname.slice('/app'.length);
  let file = path.join(base, decodeURIComponent(rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`KIRO site on http://localhost:${port}`));
