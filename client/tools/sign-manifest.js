#!/usr/bin/env node
'use strict';
// Ký manifest để người chơi có thể tải gói cập nhật an toàn.
//   node tools/sign-manifest.js <publisher.key.pem> <manifest.json>   -> ghi manifest.json.sig (Ed25519, base64)
const crypto = require('crypto');
const fs = require('fs');
const [keyFile, manifestFile] = process.argv.slice(2);
if (!keyFile || !manifestFile) { console.error('Cách dùng: sign-manifest.js <key.pem> <manifest.json>'); process.exit(1); }
const sig = crypto.sign(null, fs.readFileSync(manifestFile), crypto.createPrivateKey(fs.readFileSync(keyFile)));
fs.writeFileSync(manifestFile + '.sig', sig.toString('base64'));
console.log('Đã ký', manifestFile);
