const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const BASE = __dirname;

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  // Strip query string and normalize slashes to prevent path traversal
  const safeUrl  = req.url.split('?')[0].replace(/\\/g, '/');
  const relative = safeUrl === '/' ? 'index.html' : safeUrl.replace(/^\/+/, '');
  const filePath = path.resolve(BASE, relative);

  // Reject any path that escapes the project root
  if (!filePath.startsWith(BASE + path.sep) && filePath !== BASE) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    // L-1: security headers — mirrors what a production host should serve
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'text/plain',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Allows Supabase, Yahoo (via edge function only — not client), CDN scripts, Google Fonts
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "img-src 'self' data:",
        "frame-ancestors 'none'",
      ].join('; '),
    });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
