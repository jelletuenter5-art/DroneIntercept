// Smoke test: page loads without console errors, launches, flies autonomously (full world, random traffic) and
// reports crashes, stalls, lowest height and identifications. Then a few seconds of real rendering + a screenshot.
// Usage: node smoke.js [--seconds 200] [--seed 7] [--render 15]
'use strict';
const path = require('path'), { args, buildTestPage, openGame, outDir } = require('./lib');
(async () => {
  const a = args({ seconds: 200, seed: 7, render: 15 });
  const g = await openGame(buildTestPage(), { seed: a.seed, viewport: { width: 1280, height: 800 } });
  const r = await g.page.evaluate(sec => {
    const T = __t, S = T.state; T.launch(); S.paused = true;
    let crashes = 0, stallT = 0, wasCr = false, minAgl = 1e9;
    for (let k = 0; k < 120 * sec; k++) {
      T.physicsStep(1 / 120);
      if (S.crashed && !wasCr) crashes++; wasCr = S.crashed; if (S.stalled) stallT += 1 / 120;
      if (S.launchStage === 'active' && !S.crashed) minAgl = Math.min(minAgl, S.pos.y - T.terrainHeight(S.pos.x, S.pos.z));
    }
    S.paused = false;
    const all = [...T.scouts, ...T.ambientActors];
    return { simSeconds: Math.round(S.time), crashes, stallSeconds: +stallT.toFixed(1), minAglM: Math.round(minAgl), batteryPct: Math.round(S.battery * 100),
      stage: S.launchStage, contacts: all.length, identified: all.filter(c => c.identified).length };
  }, a.seconds);
  console.log('autonomous flight:', JSON.stringify(r));
  if (a.render) {
    await g.page.waitForTimeout(a.render * 1000);
    const f = path.join(outDir(), 'smoke.png'); await g.page.screenshot({ path: f, timeout: 180000 }); console.log('screenshot:', f);
  }
  console.log(g.errors.length ? 'CONSOLE ERRORS:\n  ' + g.errors.join('\n  ') : 'no console errors');
  const baked = await g.page.evaluate(() => !!(window.__siteBake && window.__siteBake.used));   // fast-load bake still matches the code?
  console.log(baked ? 'site layout: baked (fast load)' : 'WARNING: site layout bake is stale — run: node tools/bake-world.js (the game still works, it just loads slower)');
  const ok = !g.errors.length && r.crashes === 0 && r.stage === 'active';
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED'); await g.close(); process.exit(ok ? 0 : 1);
})();
