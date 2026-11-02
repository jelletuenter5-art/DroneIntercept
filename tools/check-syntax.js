// Parse the game's <script type="module"> with acorn — catches syntax errors without a browser.
// Usage: node check-syntax.js
'use strict';
const fs = require('fs'), path = require('path'), { ROOT } = require('./lib');
let acorn; try { acorn = require('acorn'); } catch (e) { acorn = require(require('path').join(require('child_process').execSync('npm root -g').toString().trim(), 'acorn')); }
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('No <script type="module"> found'); process.exit(1); }
const offset = html.slice(0, m.index).split('\n').length;
try { acorn.parse(m[1], { ecmaVersion: 'latest', sourceType: 'module' }); console.log('syntax OK'); }
catch (e) { console.error(`SYNTAX ERROR at index.html line ${e.loc.line + offset - 1}: ${e.message}`); console.error(m[1].split('\n')[e.loc.line - 1]); process.exit(1); }
