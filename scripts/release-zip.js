#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');
const dir = path.join(__dirname, '..', 'release');
const zipName = `revision-buddy-${pkg.version}.zip`;
execSync(`cd "${dir}" && zip -r "../${zipName}" main.js manifest.json`, {
  stdio: 'inherit',
});
console.log('Created', zipName);
