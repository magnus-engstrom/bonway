// Liten statisk webbserver för Bonway, utan beroenden. Serverar public/ och används av Railway
// (npm start). Text komprimeras med gzip och bilder får cachas av webbläsaren en dag.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const COMPRESS = new Set(['.html', '.css', '.js', '.json', '.svg']);

// Filerna ändras bara vid ny deploy, så komprimerade versioner kan sparas i minnet
const gzipped = new Map();

function send(req, res, file, stat) {
  const ext = path.extname(file);
  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.setHeader('ETag', etag);
  // Bilder byts sällan; allt annat kontrolleras mot servern så att en ny deploy syns direkt
  res.setHeader('Cache-Control', ext === '.png' ? 'public, max-age=86400' : 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }

  if (COMPRESS.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let body = gzipped.get(etag + file);
    if (!body) { body = zlib.gzipSync(fs.readFileSync(file)); gzipped.set(etag + file, body); }
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.writeHead(200, { 'Content-Length': body.length });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  res.writeHead(200, { 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  // Bara filer inne i public/ får serveras
  let file = path.join(ROOT, path.normalize(pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) { file = path.join(file, 'index.html'); return fs.stat(file, (e2, s2) => e2 ? notFound(res) : send(req, res, file, s2)); }
    if (err) return notFound(res);
    send(req, res, file, stat);
  });
}).listen(PORT, () => console.log(`Bonway körs på http://localhost:${PORT}`));

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hittades inte');
}
