// Pursuit benchmark: deterministic engagements against spawned scouts (10 per type by default), each spawned
// 0.9–2.2 km ahead of the drone (bearing ±60°, random heading, 120–370 m AGL — often beyond radar), forced
// identified (identifyContact) and pursued until hit, crash, track loss or 240 s.
// Reports hits, time, battery, weave detections ('settling in behind') and near-miss passes (< 5 m, no contact).
// Usage: node bench.js [--wind 0] [--n 30] [--kinds light,heavy,fast] [--ref <git ref>] [--verbose]
//   --ref builds that commit's index.html instead of the working copy (e.g. --ref HEAD~3 to compare).
'use strict';
const { args, buildTestPage, openGame } = require('./lib');
(async () => {
  const a = args({ wind: 0, n: 30, kinds: 'light,heavy,fast' });
  const kinds = String(a.kinds).split(','), file = buildTestPage(a.ref);
  const g = await openGame(file, { noRaf: true });
  await g.page.evaluate(() => { const T = __t; T.state.paused = true; T.launch(); for (let i = 0; i < 120 * 12; i++) T.physicsStep(1 / 120); });
  const res = [];
  for (let i = 0; i < a.n; i++) {
    const r = await g.page.evaluate(({ i, wind, kinds }) => {
      const T = __t, S = T.state, THREE = T.THREE;
      let seed = 1000 + i * 7919; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      for (const s of [...T.scouts]) T.removeScout(s);
      for (const x of [...T.ambientActors]) if (T.removeAmbient) T.removeAmbient(x);
      T.ambientActors.length = 0;
      T.env.windAuto = false; T.env.windSpeed = wind; T.env.windDir = rnd() * 6.283; T.env.weatherAuto = false;
      Object.assign(S, { replenishTimer: 1e9, returning: false, crashed: false, rtb: false, pursuitMode: false, aiTarget: null, battery: 1, stalled: false,
        batteryDead: false, launchStage: 'active', aiActivated: true, manualWaypointActive: false, searchWp: null, userAlt: null, gamma: 0, bank: 0, modeBlend: 0, tiltX: 0, tiltZ: 0 });
      S.ignoredTargets.clear();
      const gy = T.terrainHeight(0, 0); S.pos.set(0, gy + 320, 0); S.prevPos.copy(S.pos); S.vel.set(0, 0, -T.V_CRUISE); S.cruiseSpeed = T.V_CRUISE; S.rot.set(0, 0, 0);
      for (let k = 0; k < 120; k++) T.physicsStep(1 / 120);   // let the wind settle
      S.pos.set(0, gy + 320, 0); S.rot.y = 0;
      const kind = kinds[i % kinds.length], d = 900 + rnd() * 1300, brg = (rnd() - .5) * 2.1, x = S.pos.x - Math.sin(brg) * d, z = S.pos.z - Math.cos(brg) * d;
      const s = T.createScout(kind, 'normal', new THREE.Vector3(x, T.terrainHeight(x, z) + 120 + rnd() * 250, z));
      s.hdg = rnd() * 6.283; s.vel.set(-Math.sin(s.hdg) * s.speed, 0, -Math.cos(s.hdg) * s.speed); s.yaw = s.hdg;
      T.identifyContact(s); T.startPursuit(s);
      const tag0 = S.tagCount, b0 = S.battery; let t = 0, settles = 0, lastSettle = 0, minD = 1e9, reason = 'timeout', passes = 0, inPass = false, passMin = 1e9;
      while (t < 240) {
        T.physicsStep(1 / 120); t += 1 / 120;
        const dd = S.pos.distanceTo(s.pos); if (dd < minD) minD = dd;
        if (dd < 15) { inPass = true; passMin = Math.min(passMin, dd); } else if (inPass) { if (passMin < 5) passes++; inPass = false; passMin = 1e9; }
        if ((S.attack.settleUntil || 0) !== lastSettle) { lastSettle = S.attack.settleUntil || 0; if (lastSettle) settles++; }
        if (S.tagCount > tag0) { reason = 'hit'; break; }
        if (S.crashed) { reason = 'crash'; break; }
        if (!S.pursuitMode) { reason = 'ended'; break; }
      }
      return { i, kind, startM: Math.round(d), result: reason, s: +t.toFixed(1), batteryPct: +((b0 - S.battery) * 100).toFixed(1), settles, nearMiss: passes, closestM: +minD.toFixed(1) };
    }, { i, wind: a.wind, kinds });
    res.push(r); if (a.verbose) console.log(JSON.stringify(r)); else process.stdout.write(r.result === 'hit' ? '.' : 'x');
  }
  if (!a.verbose) console.log();
  const sum = rs => { const h = rs.filter(r => r.result === 'hit'); return `${h.length}/${rs.length} hits · mean ${(h.reduce((s, r) => s + r.s, 0) / Math.max(1, h.length)).toFixed(1)} s · ` +
    `battery ${(h.reduce((s, r) => s + r.batteryPct, 0) / Math.max(1, h.length)).toFixed(1)} % · runs with weave ${rs.filter(r => r.settles).length} · near-miss passes ${rs.reduce((s, r) => s + r.nearMiss, 0)}`; };
  console.log(`BENCHMARK ${a.ref ? 'ref ' + a.ref : 'working copy'} · wind ${a.wind} m/s: ${sum(res)}`);
  for (const k of kinds) console.log(`  ${k.padEnd(6)} ${sum(res.filter(r => r.kind === k))}`);
  const fails = res.filter(r => r.result !== 'hit'); if (fails.length) { console.log('  not hit:'); for (const f of fails) console.log('   ', JSON.stringify(f)); }
  if (g.errors.length) console.log('CONSOLE ERRORS:\n  ' + g.errors.join('\n  '));
  await g.close();
})();
