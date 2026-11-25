'use strict';
// Đóng gói toàn bộ mã client + Three.js thành một file dist/bundle.js (chạy offline, không cần CDN).
const esbuild = require('esbuild');

const minify = process.argv.includes('--min');

esbuild
  .build({
    entryPoints: ['src/main.js'],
    bundle: true,
    outfile: 'dist/bundle.js',
    format: 'iife',
    target: 'chrome120',
    sourcemap: !minify,
    minify,
    loader: { '.json': 'json' },
    logLevel: 'info',
  })
  .then(() => {
    // Bộ giải mã Draco và Basis/KTX2 chép vào dist/decoders để chạy offline (không dùng CDN).
    const fs = require('fs');
    const path = require('path');
    const libs = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm', 'libs');
    const jobs = [
      ['draco/gltf', 'draco', ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']],
      ['basis', 'basis', ['basis_transcoder.js', 'basis_transcoder.wasm']],
    ];
    for (const [from, to, files] of jobs) {
      const out = path.join(__dirname, 'dist', 'decoders', to);
      fs.mkdirSync(out, { recursive: true });
      for (const f of files) {
        const src = path.join(libs, from, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
        else console.warn('[build] thiếu bộ giải mã', src);
      }
    }
    console.log(minify ? 'Build (nén) xong.' : 'Build xong.');
  })
  .catch(() => process.exit(1));
