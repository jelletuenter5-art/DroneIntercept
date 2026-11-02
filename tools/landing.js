// Return-to-base landing test: from 3.5 km out (random direction, 300 m AGL) accept RTB and fly until touchdown.
// Reports on/off the pad, distance from centre and landing-phase duration per wind speed.
// Usage: node landing.js [--winds 0,8,13] [--per 8]
'use strict';
const { args, buildTestPage, openGame } = require('./lib');
(async () => {
  const a = args({ winds: '0,8,13', per: 8 }), winds = String(a.winds).split(',').map(Number);
  const g = await openGame(buildTestPage(), { noRaf: true });
  await g.page.evaluate(() => { __t.state.paused = true; });
  const res = [];
  for (const w of winds) for (let i = 0; i < a.per; i++) {
    const r = await g.page.evaluate(({ w, i }) => {
      const T = __t, S = T.state; let seed = 77 + i * 131 + w * 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      for (const s of [...T.scouts]) T.removeScout(s);
      S.replenishTimer = 1e9; T.env.windAuto = false; T.env.windSpeed = w; T.env.windDir = rnd() * 6.283; T.env.weatherAuto = false;
      if (S.launchStage !== 'parked') T.resetToPad('manual');
      T.launch(); for (let k = 0; k < 120 * 12; k++) T.physicsStep(1 / 120);
      const ang = rnd() * 6.283, x = Math.cos(ang) * 3500, z = Math.sin(ang) * 3500;
      S.pos.set(x, T.terrainHeight(x, z) + 300, z); S.prevPos.copy(S.pos); S.rot.y = rnd() * 6.283; S.battery = 1; S.lastTouchdown = null; S.pursuitMode = false; S.aiTarget = null;
      for (let k = 0; k < 120 * 20; k++) T.physicsStep(1 / 120);
      T.acceptRtb(); let t = 0, landT = null;
      while (t < 400) { T.physicsStep(1 / 120); t += 1 / 120; if (S.rtb === 'landing' && landT === null) landT = t; if (S.lastTouchdown) break; if (S.crashed) return { w, i, result: 'CRASH' }; }
      const td = S.lastTouchdown;
      return { w, i, result: td ? (td.onPad ? 'on pad' : 'OFF PAD') : 'timeout', offM: td ? +td.off.toFixed(2) : null, totalS: Math.round(t), landingS: landT ? Math.round(t - landT) : null };
    }, { w, i });
    res.push(r); process.stdout.write(r.result === 'on pad' ? '.' : 'x');
  }
  console.log();
  for (const w of winds) {
    const rr = res.filter(r => r.w === w), ok = rr.filter(r => r.result === 'on pad');
    const rng = (k) => rr.length ? `${Math.min(...rr.map(r => r[k] ?? 1e9))}-${Math.max(...rr.map(r => r[k] ?? 0))}` : '-';
    console.log(`LANDING wind ${w} m/s: ${ok.length}/${rr.length} on pad · ${rng('offM')} m from centre · landing phase ${rng('landingS')} s`);
    for (const f of rr.filter(r => r.result !== 'on pad')) console.log('   ', JSON.stringify(f));
  }
  if (g.errors.length) console.log('CONSOLE ERRORS:\n  ' + g.errors.join('\n  '));
  await g.close(); process.exit(res.every(r => r.result === 'on pad') ? 0 : 1);
})();
