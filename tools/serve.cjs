// Tiny static server for local testing: node tools/serve.cjs [dir] [port]
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(process.argv[2] || 'dist'); const port = +(process.argv[3] || 8080);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.css': 'text/css' };
http.createServer((q, s) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(s);
}).listen(port, () => console.log('serving', root, 'on', port));
