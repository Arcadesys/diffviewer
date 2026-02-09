#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const manifest = require('../manifest.json');
const dir = path.join(__dirname, '..', 'release');

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'main.js'), path.join(dir, 'main.js'));
fs.writeFileSync(
  path.join(dir, 'manifest.json'),
  JSON.stringify({ ...manifest, version: pkg.version }, null, 2)
);
console.log('Release', pkg.version, '->', dir + path.sep);
