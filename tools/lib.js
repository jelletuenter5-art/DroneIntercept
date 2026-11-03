// Shared helpers for the DroneIntercept test tools: build a test copy of index.html, serve it, open it in Chromium.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..'), BUILD = path.join(__dirname, '.build'), OUT = path.join(__dirname, 'out');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// playwright: local tools/node_modules first, then a global install (e.g. a pre-installed container).
function playwright() {
  try { return require('playwright'); } catch (e) {
    const g = execSync('npm root -g').toString().trim();
    return require(path.join(g, 'playwright'));
  }
}

// Simple CLI flags: --wind 6 --n 30 --kinds light,fast --ref HEAD~1
function args(defaults = {}) {
  const a = { ...defaults }, v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) {
    const k = v[i].slice(2), nx = v[i + 1];
    if (nx === undefined || nx.startsWith('--')) a[k] = true; else { a[k] = isNaN(+nx) ? nx : +nx; i++; }
  }
  return a;
}

// Names exposed on window.__t in the test copy (each guarded, so older versions of the game still build).
const EXPOSE = ['THREE', 'state', 'scouts', 'ambientActors', 'createScout', 'removeScout', 'identifyContact', 'physicsStep', 'SCOUT_SPEC',
  'PAD', 'PAD_HALF', 'acceptRtb', 'env', 'wind', 'createPassengerPlane', 'createLightPlane', 'spawnTransitAirliner', 'removeAmbient',
  'camera', 'renderer', 'scene', 'resetToPad', 'endPursuit', 'terrainHeight', 'craft', 'replay', 'V_DASH', 'V_CRUISE', 'LIGHT_LAYOUT',
  'zv', 'markCur', 'DRONE_SCALE', 'logEvent', 'AVOID', 'SITES', 'FLAT', 'terrainNatural', 'game', 'startMission', 'beginMission', 'placeFieldPad', 'PAD', 'restY', 'raidBanner', 'guide', 'groundY', 'meshHeight', 'ground', 'MISSIONS', 'DIFFS', 'spawnRaider', 'planRaid', 'missionScore', 'showMissionResult', 'isThreatClass', 'hasTrack', 'sensorQuality', 'losPoint', 'blurAmount', 'classifyTick', 'setThermal', 'ROADS', 'RESERVOIRS', 'isWater', 'missionTick', 'FIRST_RAIDER_T', 'siteRadarSees', 'siteRadarRange', 'SITE_RADAR', 'ARENA', 'updateEnvironment'];

// Test copy of the game: local three.js if available, seeded Math.random (?seed=N), optional replay suppression
// (window.__noReplay) and the internals on window.__t. `ref` = a git ref to build an older version for comparison.
function buildTestPage(ref, name) {
  let src = ref ? execSync(`git show ${ref}:index.html`, { cwd: ROOT, maxBuffer: 64 << 20 }).toString() : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  fs.mkdirSync(BUILD, { recursive: true });
  const local = path.join(__dirname, 'node_modules', 'three', 'build', 'three.module.js');
  if (fs.existsSync(local)) { fs.copyFileSync(local, path.join(BUILD, 'three.module.js')); src = src.split(THREE_CDN).join('./three.module.js'); }
  const seed = `<script>(function(){var s=(+(new URLSearchParams(location.search).get('seed'))||12345)>>>0;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();</script>`;
  src = src.replace('<head>', '<head>' + seed);
  src = src.replace('setTimeout(() => startReplay(state.lastReplay, true), 900);', 'if (!window.__noReplay) setTimeout(() => startReplay(state.lastReplay, true), 900);');
  const expose = `\nwindow.__t = {};\n` + EXPOSE.map(n => `try { window.__t.${n} = ${n}; } catch (e) {}`).join('\n') + `
window.__t.launch = () => document.getElementById('launchBtn').click();
window.__t.startPursuit = c => { state.aiTarget = c; state.pursuitMode = true; state.attack = {phase:'intercept', side:0}; state.manualWaypointActive = false; try { mapWaypoint = null; } catch (e) {} state.searchWp = null; };
`;
  const i = src.lastIndexOf('requestAnimationFrame(animate);');
  if (i < 0) throw new Error('could not find the main loop in index.html');
  src = src.slice(0, i) + expose + src.slice(i);
  const file = (name || (ref ? 'ref-' + ref.replace(/[^\w.-]/g, '_') : 'test')) + '.html';
  fs.writeFileSync(path.join(BUILD, file), src);
  return file;
}

// Static file server for tools/.build on a free port.
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript' };
  const srv = http.createServer((req, res) => {
    const f = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(BUILD) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() })));
}

// Launch Chromium (software GL works headless) and open the test page. noRaf: stop the render loop so the physics
// is the only user of the seeded random numbers → reproducible runs.
async function openGame(file, { seed = 12345, noRaf = false, noReplay = true, viewport = { width: 1000, height: 600 }, mode = 'sandbox' } = {}) {
  const exe = process.env.CHROMIUM_PATH || undefined;   // e.g. a system Chrome if Playwright's own browser isn't installed
  const browser = await playwright().chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const server = await serve();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(({ noRaf, noReplay }) => { if (noReplay) window.__noReplay = true; if (noRaf) window.requestAnimationFrame = () => 0; }, { noRaf, noReplay });
  await page.goto(server.url + file + '?seed=' + seed + (mode ? '&mode=' + mode : ''));
  await page.waitForFunction(() => window.__t && window.__t.state, null, { timeout: 240000 });   // generous: terrain/forest generation is slow under software GL or when several tests run in parallel
  return { browser, page, errors, close: async () => { await browser.close(); server.close(); } };
}

function outDir() { fs.mkdirSync(OUT, { recursive: true }); return OUT; }

module.exports = { ROOT, BUILD, OUT, playwright, args, buildTestPage, serve, openGame, outDir };
