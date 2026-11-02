// Mid-air separation & collision test (scouts, airliners, light aircraft).
//  1. Encounters: two aircraft set up on an exact collision course (head-on, 90° crossing, overtaking) for each pair
//     of types, nothing else in the air → they should avoid each other (closest distance > 0, no collision).
//  2. Unavoidable: two scouts head-on 60 m apart → must collide, explode and be removed (+ log line).
//  4. Converging swarm: 24 scouts all flying at one point (with/without avoidance) — shows collisions do happen.
//  3. Crowd: N scouts spawned in one ~2 km area for some minutes → some collisions are expected (they can't all
//     avoid each other); reports collisions, survivors and the time per physics step.
// Usage: node separation.js [--crowd 95] [--minutes 5] [--area 2000] [--band 300] [--noavoid]
//   (crowd spawn square / height band in m; --noavoid = crowd without avoidance, as a baseline)
'use strict';
const { args, buildTestPage, openGame } = require('./lib');
(async () => {
  const a = args({ crowd: 95, minutes: 5, area: 2000, band: 300, noavoid: false });
  const g = await openGame(buildTestPage(), { noRaf: true });
  const r = await g.page.evaluate(({ crowd, minutes, area, band, noavoid }) => {
    const T = __t, S = T.state, THREE = T.THREE, out = {};
    S.replenishTimer = 1e9; T.env.windAuto = false; T.env.windSpeed = 4; T.env.weatherAuto = false;
    const clear = () => { for (const s of [...T.scouts]) T.removeScout(s); for (const x of [...T.ambientActors]) T.removeAmbient(x); };
    const make = (type, x, y, z, hdg) => {
      let o;
      if (['light', 'heavy', 'fast'].includes(type)) { o = T.createScout(type, 'normal', new THREE.Vector3(x, y, z)); o.hdg = hdg; o.spd = o.speed; o.vel.set(-Math.sin(hdg) * o.speed, 0, -Math.cos(hdg) * o.speed); o.yaw = hdg;
        o.waypoint = new THREE.Vector3(x - Math.sin(hdg) * 6000, y, z - Math.cos(hdg) * 6000); o.waypointTimer = 1e9; o.routeY = y; o.band = [y - T.terrainHeight(x, z), y - T.terrainHeight(x, z)]; }
      else if (type === 'cessna') { o = T.createLightPlane(x, z); o.pos.y = y; o.prev.copy(o.pos); o.hdg = hdg; o.yaw = hdg; o.agl = y - T.terrainHeight(x, z); o.altAmp = 0;
        o.goal = {x: x - Math.sin(hdg) * 6000, z: z - Math.cos(hdg) * 6000}; o.vel.set(-Math.sin(hdg) * o.speed, 0, -Math.cos(hdg) * o.speed); }
      else { o = T.createPassengerPlane(x, y, z, 1); o.hdg = hdg; o.yaw = hdg; o.baseHdg = hdg; o.tgtHdg = hdg; o.turnT = 1e9; o.altBase = y; o.altAmp = 0;
        o.vel.set(-Math.sin(hdg) * o.speed, 0, -Math.cos(hdg) * o.speed); }
      return o;
    };
    const speedOf = t => ({ light: 42, heavy: 85, fast: 92, cessna: 59, plane: 120 })[t];
    // 1. encounters
    const types = ['light', 'fast', 'heavy', 'cessna', 'plane'], enc = [];
    for (let i = 0; i < types.length; i++) for (let j = i; j < types.length; j++) for (const geo of ['head-on', 'crossing', 'overtake']) {
      const A = types[i], B = types[j];
      if (geo === 'overtake' && speedOf(A) === speedOf(B)) continue;
      clear(); const y = T.terrainHeight(0, 0) + 600, tc = 25;                       // they would meet at the origin after 25 s
      const fast = speedOf(A) >= speedOf(B) ? A : B, slow = fast === A ? B : A;
      let o1, o2;
      if (geo === 'head-on') { o1 = make(A, 0, y, speedOf(A) * tc, 0); o2 = make(B, 0, y, -speedOf(B) * tc, Math.PI); }
      else if (geo === 'crossing') { o1 = make(A, 0, y, speedOf(A) * tc, 0); o2 = make(B, -speedOf(B) * tc, y, 0, -Math.PI / 2); }
      else { o1 = make(fast, 0, y, speedOf(fast) * tc, 0); o2 = make(slow, 0, y, speedOf(slow) * tc, 0); }
      let minD = 1e9, hit = false;
      for (let k = 0; k < 120 * 50; k++) {
        T.physicsStep(1 / 120);
        const alive = o => o.isScout ? !o.destroyed : !o.gone;
        if (!alive(o1) || !alive(o2)) { hit = true; break; }
        minD = Math.min(minD, o1.pos.distanceTo(o2.pos));
      }
      enc.push({ pair: (geo === 'overtake' ? fast + '>' + slow : A + '×' + B), geo, result: hit ? 'COLLIDED' : 'avoided', closestM: hit ? 0 : Math.round(minD) });
    }
    out.encounters = enc;
    // 2. unavoidable
    clear(); const y0 = T.terrainHeight(0, 0) + 500, s1 = make('light', 0, y0, 30, 0), s2 = make('light', 0, y0, -30, Math.PI); s1.bornAt = s2.bornAt = S.time - 10;   // waive the 1.5 s spawn grace for this test
    const logBefore = document.querySelectorAll('.ev').length; let t2 = 0;
    for (; t2 < 5 && !(s1.destroyed && s2.destroyed); t2 += 1 / 120) T.physicsStep(1 / 120);
    for (let k = 0; k < 120; k++) T.physicsStep(1 / 120);
    const logs = [...document.querySelectorAll('.ev')].map(e => e.textContent).filter(x => /MID-AIR/.test(x));
    out.unavoidable = { collidedAfterS: +t2.toFixed(2), bothRemoved: !T.scouts.includes(s1) && !T.scouts.includes(s2), explosions: S.explosions.length, log: logs.slice(-1)[0] || '(none)' };
    // 3. crowd (--noavoid: avoidance switched off, as a baseline)
    clear(); if (noavoid) for (const k in T.AVOID) T.AVOID[k].look = 0; const kinds = ['light', 'heavy', 'fast'];
    for (let i = 0; i < crowd; i++) { const x = (Math.random() - .5) * area, z = (Math.random() - .5) * area; T.createScout(kinds[i % 3], 'normal', new THREE.Vector3(x, T.terrainHeight(x, z) + 120 + Math.random() * band, z)); }
    const n0 = T.scouts.length, t0 = performance.now(); let collisions = 0, alive0 = n0, avoidSamples = 0, samples = 0;
    for (let k = 0; k < 120 * 60 * minutes; k++) {
      T.physicsStep(1 / 120);
      const alive = T.scouts.filter(s => !s.destroyed).length; if (alive < alive0) { collisions += (alive0 - alive) / 2; alive0 = alive; }
      if (k % 120 === 0) for (const s of T.scouts) if (!s.destroyed) { samples++; if (s.avoid && S.time < s.avoid.until) avoidSamples++; }
    }
    const ms = (performance.now() - t0) / (120 * 60 * minutes);
    out.crowd = { scouts: n0, minutes, collisions: Math.round(collisions), survivors: T.scouts.filter(s => !s.destroyed).length, msPerPhysicsStep: +ms.toFixed(3), timeAvoidingPct: +(100 * avoidSamples / Math.max(1, samples)).toFixed(1), areaM: area, heightBandM: band, nanPositions: T.scouts.filter(s => !isFinite(s.pos.x + s.pos.y + s.pos.z)).length };
    // 4. converging swarm: 24 scouts on a 1.5 km circle all flying at the centre, same height — more conflicts than
    //    one-at-a-time avoidance can solve, so some collide. Run with and without avoidance.
    out.swarm = [];
    for (const avoid of [true, false]) {
      clear(); const look = {}; for (const k in T.AVOID) { look[k] = T.AVOID[k].look; if (!avoid) T.AVOID[k].look = 0; }
      const yS = T.terrainHeight(0, 0) + 600, sw = [];
      for (let i = 0; i < 24; i++) { const ang = i / 24 * 6.283, x = Math.cos(ang) * 1500, z = Math.sin(ang) * 1500; sw.push(make(['light', 'heavy', 'fast'][i % 3], x, yS, z, Math.atan2(x, z))); }
      for (const s of sw) { s.waypoint.set(-s.pos.x * 3, yS, -s.pos.z * 3); }
      for (let k = 0; k < 120 * 90; k++) T.physicsStep(1 / 120);
      out.swarm.push({ avoidance: avoid, scouts: 24, collided: sw.filter(s => s.destroyed).length });
      for (const k in T.AVOID) T.AVOID[k].look = look[k];
    }
    return out;
  }, a);
  console.log('ENCOUNTERS (collision courses, avoidance should win):');
  for (const e of r.encounters) console.log('  ' + e.pair.padEnd(14) + e.geo.padEnd(10) + e.result.padEnd(10) + (e.result === 'avoided' ? 'closest ' + e.closestM + ' m' : ''));
  const av = r.encounters.filter(e => e.result === 'avoided').length;
  console.log(`  → ${av}/${r.encounters.length} avoided`);
  console.log('UNAVOIDABLE (two scouts head-on, 60 m apart):', JSON.stringify(r.unavoidable));
  console.log('CROWD:', JSON.stringify(r.crowd));
  console.log('CONVERGING SWARM (24 scouts → one point):', r.swarm.map(x => (x.avoidance ? 'with' : 'without') + ' avoidance ' + x.collided + '/24 destroyed').join(' · '));
  console.log(g.errors.length ? 'CONSOLE ERRORS:\n  ' + g.errors.join('\n  ') : 'no console errors');
  await g.close();
})();
