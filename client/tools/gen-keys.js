#!/usr/bin/env node
'use strict';
// Tạo cặp khoá Ed25519 để ký manifest cập nhật. KHOÁ RIÊNG phải giữ bí mật, KHÔNG đưa vào game/repo.
//   node tools/gen-keys.js <thư-mục-đích>   -> publisher.pub.pem (đưa vào assets/) và publisher.key.pem (giữ kín)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || '.');
fs.mkdirSync(out, { recursive: true });
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(path.join(out, 'publisher.pub.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
fs.writeFileSync(path.join(out, 'publisher.key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
console.log('Đã tạo publisher.pub.pem (công khai) và publisher.key.pem (RIÊNG TƯ) trong', out);
