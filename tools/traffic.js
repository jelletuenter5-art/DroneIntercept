// Civil traffic realism check: simulates the airspace (airliners + light aircraft, no scouts) and reports per type
// the steepest bank, smallest turn radius, max pitch and climb/descent rate, how far from the original heading the
// airliners wander (they must still leave the map), how widely light aircraft roam and their lowest height above ground.
// Usage: node traffic.js [--minutes 30] [--wind 6]
'use strict';
const { args, buildTestPage, openGame } = require('./lib');
(async () => {
  const a = args({ minutes: 30, wind: 6 });
  const g = await openGame(buildTestPage(), { noRaf: true });
  const r = await g.page.evaluate(({ minutes, wind }) => {
    const T = __t, S = T.state, A = T.ARENA; S.replenishTimer = 1e9; T.env.windAuto = false; T.env.windSpeed = wind;
    for (const s of [...T.scouts]) T.removeScout(s);
    for (let i = 0; i < 3; i++) T.spawnTransitAirliner();
    const st = new Map(); let spawned = 3;
    for (let k = 0; k < 120 * 60 * minutes; k++) {
      T.physicsStep(1 / 120);
      if (k % (120 * 40) === 0 && T.ambientActors.filter(x => x.type === 'plane').length < 3) { T.spawnTransitAirliner(); spawned++; }
      if (k % 12) continue;
      for (const x of T.ambientActors) {
        if (x.type === 'birds') continue;
        let s = st.get(x); if (!s) { s = { type: x.type, bank: 0, pitch: 0, vy: 0, minR: 1e9, dev: 0, out: 0, minAgl: 1e9, cells: new Set(), h: x.hdg, t: S.time, t0: S.time }; st.set(x, s); }
        s.bank = Math.max(s.bank, Math.abs(x.bank || 0)); s.pitch = Math.max(s.pitch, Math.abs(x.pitch || 0)); s.vy = Math.max(s.vy, Math.abs(x.vel.y));
        const w = Math.abs((x.hdg - s.h) / ((S.time - s.t) || 1)); if (w > 1e-3) s.minR = Math.min(s.minR, x.speed / w); s.h = x.hdg; s.t = S.time;
        if (x.baseHdg !== undefined) s.dev = Math.max(s.dev, Math.abs(Math.atan2(Math.sin(x.hdg - x.baseHdg), Math.cos(x.hdg - x.baseHdg))));
        s.out = Math.max(s.out, Math.max(Math.abs(x.pos.x), Math.abs(x.pos.z))); s.minAgl = Math.min(s.minAgl, x.pos.y - T.terrainHeight(x.pos.x, x.pos.z));
        s.cells.add(Math.floor((x.pos.x + A) / (A / 3)) + "," + Math.floor((x.pos.z + A) / (A / 3))); s.t1 = S.time; s.gone = x.gone;
      }
    }
    const d = 57.3, all = [...st.values()], pl = all.filter(s => s.type === 'plane'), ce = all.filter(s => s.type === 'cessna');
    const mx = (l, f) => Math.max(...l.map(f)), mn = (l, f) => Math.min(...l.map(f));
    return {
      airliners: { count: pl.length, maxBankDeg: +(mx(pl, s => s.bank) * d).toFixed(1), minTurnRadiusM: Math.round(mn(pl, s => s.minR)), maxPitchDeg: +(mx(pl, s => s.pitch) * d).toFixed(1),
        maxClimbMs: +mx(pl, s => s.vy).toFixed(1), maxCourseChangeDeg: Math.round(mx(pl, s => s.dev) * d), onMapS: `${Math.round(mn(pl, s => s.t1 - s.t0))}-${Math.round(mx(pl, s => s.t1 - s.t0))}` },
      lightAircraft: { count: ce.length, maxBankDeg: +(mx(ce, s => s.bank) * d).toFixed(1), minTurnRadiusM: Math.round(mn(ce, s => s.minR)), maxPitchDeg: +(mx(ce, s => s.pitch) * d).toFixed(1),
        maxClimbMs: +mx(ce, s => s.vy).toFixed(1), farthestFromCentreM: Math.round(mx(ce, s => s.out)), gridCellsVisited: ce.map(s => s.cells.size + '/36').join(' '), minAglM: Math.round(mn(ce, s => s.minAgl)) }
    };
  }, a);
  console.log(`TRAFFIC ${a.minutes} min, wind ${a.wind} m/s`); console.log(' airliners     ', JSON.stringify(r.airliners)); console.log(' light aircraft', JSON.stringify(r.lightAircraft));
  if (g.errors.length) console.log('CONSOLE ERRORS:\n  ' + g.errors.join('\n  '));
  await g.close();
})();
