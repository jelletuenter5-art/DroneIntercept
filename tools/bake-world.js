// Bakes the result of the (slow, deterministic) site search into index.html as SITE_BAKE, together with the
// fingerprint of the code it depends on. Run it after changing the terrain or the site placement:
//   node tools/bake-world.js        (writes index.html)      node tools/bake-world.js --check   (only reports)
// The game falls back to computing the layout itself whenever the fingerprint doesn't match, so a stale bake is
// never wrong — just slower to load.
'use strict';
const fs = require('fs'), path = require('path');
const { buildTestPage, openGame, args } = require('./lib');
(async () => {
  const a = args(), file = path.join(__dirname, '..', 'index.html');
  const g = await openGame(buildTestPage(undefined, 'bake'), { noRaf: true });
  const info = await g.page.evaluate(() => ({ used: window.__siteBake.used, key: window.__siteBake.key, data: window.__siteBake.data() }));
  await g.close();
  if (a.check) { console.log(info.used ? 'BAKE OK · key ' + info.key : 'BAKE STALE · run: node tools/bake-world.js'); process.exit(info.used ? 0 : 1); }
  const src = fs.readFileSync(file, 'utf8'), re = /\/\*BAKE\*\/[\s\S]*?\/\*\/BAKE\*\//;
  if (!re.test(src)) throw new Error('BAKE markers not found in index.html');
  fs.writeFileSync(file, src.replace(re, '/*BAKE*/' + JSON.stringify(info.data) + '/*/BAKE*/'));
  console.log((info.used ? 'already baked, rewritten' : 'baked') + ' · key ' + info.key + ' · ' + info.data.sites.length + ' sites, ' + info.data.res.length + ' reservoirs · ' + JSON.stringify(info.data).length + ' bytes');
})();
