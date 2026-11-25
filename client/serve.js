'use strict';
// Server tĩnh nhỏ để thử game ngay trên trình duyệt (http://localhost:5173) mà không cần Electron.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
};

http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    const file = path.normalize(path.join(root, url));
    const allowed = ['index.html', 'style.css', path.join('dist', 'bundle.js'), path.join('dist', 'bundle.js.map')];
    const rel = path.relative(root, file);
    const posix = rel.split(path.sep).join('/');
    const okAsset = /^assets\/(core|characters|weapons|environment|effects)\/[A-Za-z0-9_./-]+\.(glb|gltf|bin|ktx2|png|jpg|jpeg|webp|json)$/.test(posix) || posix === 'assets/manifest.json' || /^dist\/decoders\/(draco|basis)\/[A-Za-z0-9_.-]+\.(js|wasm)$/.test(posix);
    if (!allowed.includes(rel) && !okAsset) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(5173, '127.0.0.1', () => console.log('Mở http://localhost:5173 trong Chrome/Edge để chơi thử.'));
