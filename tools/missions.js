// Mission playtest with an auto-player: for each mission × difficulty, starts the mission and plays it like a
// cautious human — launches whenever a drone is on the pad, lets the autopilot patrol/identify, pursues identified
// threats (closest to the site first), returns home when the battery says so. No gimbal, no use of the warnings,
// The auto-player also works the gimbal like a human (12× zoom on the most threatening unidentified track; --gimbal off
// to disable), but uses no warnings and no map waypoints — a good human player should do better. Reports win/loss, reason, time, drones used/lost, stars and score.
// Usage: node missions.js [--missions village,dam,radar,base] [--diffs easy,normal,hard] [--seed 1] [--verbose]
//   --verbose: per scout [mission time s, km from site] at spawn, first radar detection (+ km from drone), identification, pursuit, end
'use strict';
const { args, buildTestPage, openGame } = require('./lib');
(async () => {
  const a = args({ missions: 'village,dam,radar,base', diffs: 'easy,normal,hard', seed: 1, gimbal: 'on' });
  const file = buildTestPage(), out = [];
  for (const diff of String(a.diffs).split(',')) for (const id of String(a.missions).split(',')) {
    const g = await openGame(file, { noRaf: true, seed: a.seed, mode: 'sandbox' });
    await g.page.evaluate(({ id, diff, tr }) => { if (tr) globalThis.__trace = [...tr.split('-').map(Number), []]; __t.startMission(id, diff, { skipBrief: true }); }, { id, diff, tr: a.trace });
    let r = null;
    for (let chunk = 0; chunk < 200 && !r; chunk++) {
      r = await g.page.evaluate((useGimbal) => {
        const T = __t, S = T.state, m = T.game.m;
        for (let k = 0; k < 120 * 10; k++) {
          if (S.returning && S.returnTimer > 1e8) T.resetToPad('intercept');          // (replay is off in tests: end the sortie like the replay would)
          if (S.launchStage === 'parked' && !m.result && m.dronesTotal - m.dronesUsed > 0) T.launch();
          // a ram uses the drone up anyway: cancel a return home to engage an identified threat while the battery still
          // holds a chase (also during the landing: the pursuit order makes it go around)
          if (S.launchStage === 'active' && !S.pursuitMode && S.rtb && S.battery > .2 && T.scouts.some(s => !s.destroyed && s.identified && T.isThreatClass(s.guess) && T.hasTrack(s))) S.rtb = false;
          if (S.launchStage === 'active' && !S.pursuitMode && (!S.rtb || S.rtb === 'landing')) {
            const c = T.scouts.filter(s => !s.destroyed && s.identified && T.isThreatClass(s.guess) && T.hasTrack(s))
              .sort((p, q) => Math.hypot(p.pos.x - m.site.x, p.pos.z - m.site.z) - Math.hypot(q.pos.x - m.site.x, q.pos.z - m.site.z))[0];
            if (c && (!S.rtb || S.battery > .2)) T.startPursuit(c);
            else if (!S.rtb && S.rtbNeed && S.battery - S.rtbNeed < .06) T.acceptRtb();
          }
          // gimbal operator (like a human): every 0.5 s point the zoom camera (12×) at the most threatening
          // unidentified radar track — its noisy track position, never the truth — so it gets identified at range
          if (k === 0 && (Math.cos(S.dayClock) < -.1 || S.weatherStrength > .3)) T.setThermal(true);   // (state.night is only updated by the render loop)   // like a human: thermal at night / in mist and rain
          if (useGimbal && k % 60 === 0 && S.launchStage === 'active') {
            // (a human gives up on a blip after a few seconds — e.g. hidden behind a ridge — and tries the next one)
            const tc = [...T.scouts, ...T.ambientActors].filter(c => c.trk && !c.trk.lost && !c.destroyed && !c.identified && !(c._gskip > S.time) && !(c.transit && Math.max(Math.abs(c.pos.x), Math.abs(c.pos.z)) > 4200))
              .sort((p, q) => Math.hypot(p.trk.x - m.site.x, p.trk.z - m.site.z) - Math.hypot(q.trk.x - m.site.x, q.trk.z - m.site.z))[0];
            if (tc) { tc._gt = (tc._gt || 0) + .5; if (tc._gt >= 4) { tc._gt = 0; tc._gskip = S.time + 20; } T.zv.open = true; T.zv.zoom = 12; T.zv.zEff = 1 + 11 * Math.min(1, Math.max(.25, .3 + .7 * T.sensorQuality(tc))); T.zv.halfAng = .03;
              T.zv.fwd.set(tc.trk.x - S.pos.x, tc.trk.y - S.pos.y, tc.trk.z - S.pos.z).normalize(); }
          }
          T.physicsStep(1 / 120);
          for (const x of m.raid) { const d = Math.hypot(x.pos.x - m.site.x, x.pos.z - m.site.z);
            if (x._sp === undefined) x._sp = [+m.t.toFixed(0), +(d / 1000).toFixed(1)];
            if (x.detected && !x._det) x._det = [+m.t.toFixed(0), +(d / 1000).toFixed(1), +(S.pos.distanceTo(x.pos) / 1000).toFixed(1)];
            if (x.identified && !x._id) x._id = [+m.t.toFixed(0), +(d / 1000).toFixed(1), x.guess];
            if (S.aiTarget === x && S.pursuitMode && !x._pu) x._pu = [+m.t.toFixed(0), +(d / 1000).toFixed(1)];
            if (!x._end && (x.raidDone)) x._end = [+m.t.toFixed(0), +(d / 1000).toFixed(1)]; }
          if (globalThis.__trace && k % 240 === 0 && m.t > __trace[0] && m.t < __trace[1]) __trace[2].push([Math.round(m.t), S.launchStage, S.pursuitMode ? 'PURSUIT' : '-', S.aiTarget ? (S.aiTarget.kind || S.aiTarget.type) : null, S.rtb || '-', Math.round(S.battery * 100), S.aiTarget ? 'R=' + Math.round(S.pos.distanceTo(S.aiTarget.pos)) + ' dy=' + Math.round(S.aiTarget.pos.y - S.pos.y) + ' tAgl=' + Math.round(S.aiTarget.pos.y - T.terrainHeight(S.aiTarget.pos.x, S.aiTarget.pos.z)) + ' ph=' + S.attack.phase : '', [...document.querySelectorAll('.ev')].slice(-2).map(e => e.textContent.slice(5, 70)).join(' | ')]);
          if (m.result) break;
        }
        if (!m.result) return null;
        const sc = T.missionScore();
        return { result: m.result.win ? 'WON' : 'lost', reason: m.result.reason, minutes: +(m.result.at / 60).toFixed(1), downed: m.downed + '/' + m.total,
          dronesUsed: m.dronesUsed + '/' + m.dronesTotal, lost: m.lost, incidents: S.civilianIncidents || 0, stars: sc.stars, score: sc.score,
          raiders: m.raid.map(x => x.kind + ' spawn' + JSON.stringify(x._sp) + ' det' + JSON.stringify(x._det || '-') + ' id' + JSON.stringify(x._id || '-') + ' pursue' + JSON.stringify(x._pu || '-') + ' end' + JSON.stringify(x._end || '-')), downKm: m.raid.filter(s => s.downDist !== undefined).map(s => +(s.downDist / 1000).toFixed(1)).join(' ') };
      }, a.gimbal !== 'off');
    }
    r = r || { result: 'timeout' };
    out.push({ id, diff, ...r }); console.log(`${diff.padEnd(7)}${id.padEnd(8)} ${r.result.padEnd(5)} ${r.minutes ?? '-'} min · down ${r.downed} · drones ${r.dronesUsed} (lost ${r.lost}${r.incidents ? ', civil incidents ' + r.incidents : ''}) · ★${r.stars ?? 0} · score ${r.score ?? 0} · stops at ${r.downKm || '-'} km · ${r.reason || ''}`);
    if (a.trace) console.log((await g.page.evaluate(() => globalThis.__trace[2])).map(x => '    ' + JSON.stringify(x)).join('\n'));
    if (a.verbose && r.raiders) for (const x of r.raiders) console.log('    ' + x);
    if (g.errors.length) console.log('  CONSOLE ERRORS:', g.errors.slice(0, 3).join(' | '));
    await g.close();
  }
  for (const d of String(a.diffs).split(',')) { const rr = out.filter(x => x.diff === d); console.log(`${d}: ${rr.filter(x => x.result === 'WON').length}/${rr.length} won`); }
})();
