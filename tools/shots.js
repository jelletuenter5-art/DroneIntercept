// Close-up screenshots of every aircraft model (and the drone on its pad), each from two angles, rendered alone
// against a plain sky → tools/out/models.png (contact sheet) + one PNG per view.
// Usage: node shots.js
'use strict';
const fs = require('fs'), path = require('path'), { buildTestPage, openGame, outDir } = require('./lib');
(async () => {
  const g = await openGame(buildTestPage(), { viewport: { width: 800, height: 450 } });
  const list = [['light', 'Propeller scout'], ['fast', 'Jet scout'], ['heavy', 'Heavy scout'], ['cessna', 'Light aircraft'], ['plane0', 'Widebody'], ['plane1', 'Narrowbody'], ['plane2', 'Regional'], ['drone', 'Drone (1.2 m)']];
  const out = outDir(), cells = [];
  for (const [n, label] of list) {
    const imgs = await g.page.evaluate(n => {
      const T = __t, THREE = T.THREE, r = T.renderer; T.state.paused = true;
      let o, g;
      if (n === 'drone') g = T.craft;
      else { if (['light', 'fast', 'heavy'].includes(n)) o = T.scouts.find(s => s.kind === n) || T.createScout(n);
        else if (n === 'cessna') o = T.ambientActors.find(a => a.type === 'cessna');
        else o = T.ambientActors.find(a => a.type === 'plane' && a.planeType === +n[5]) || T.createPassengerPlane(0, 500, 0, +n[5]);
        g = o.group; }
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0xa9c0d2);
      sc.add(new THREE.HemisphereLight(0xd9ecff, 0x34404c, 2)); const L = new THREE.DirectionalLight(0xffffff, 3); L.position.set(-35, 55, 25); sc.add(L);
      const par = g.parent, pos = g.position.clone(), q = g.quaternion.clone(), vis = g.visible;
      g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.visible = true; sc.add(g); g.updateMatrixWorld(true);
      g.traverse(m => { if (m.isMesh) { if (m.userData.thermalOnly) m.visible = false; else { m.visible = true; m.material.opacity = 1; } } });
      const R = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere()).radius, cam = new THREE.PerspectiveCamera(30, 800 / 450, .01, 5000), res = [];
      for (const d of [[-1, .55, -1.05], [1.25, .3, .15]]) {
        cam.position.copy(new THREE.Vector3(...d).normalize().multiplyScalar(R * 2.7)); cam.lookAt(0, 0, 0);
        r.setRenderTarget(null); r.setSize(800, 450, false); r.render(sc, cam); res.push(r.domElement.toDataURL('image/png'));
      }
      if (par) par.add(g); g.position.copy(pos); g.quaternion.copy(q); g.visible = vis; return res;
    }, n);
    imgs.forEach((v, i) => { const f = path.join(out, `model_${n}_${i}.png`); fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); cells.push([f, label]); });
  }
  // contact sheet: two views per row, via an HTML page screenshot (no image library needed)
  const html = '<body style="margin:0;background:#fff;font:12px sans-serif">' + list.map((l, r) =>
    `<div style="display:flex;position:relative"><span style="position:absolute;left:6px;top:4px">${l[1]}</span>` +
    [0, 1].map(i => `<img width="400" src="data:image/png;base64,${fs.readFileSync(cells[r * 2 + i][0]).toString('base64')}">`).join('') + '</div>').join('') + '</body>';
  const p2 = await g.browser.newPage({ viewport: { width: 800, height: 225 * list.length } });
  await p2.setContent(html); const sheet = path.join(out, 'models.png'); await p2.screenshot({ path: sheet, fullPage: true });
  console.log('model screenshots:', out, '\ncontact sheet:', sheet);
  if (g.errors.length) console.log('CONSOLE ERRORS:\n  ' + g.errors.join('\n  '));
  await g.close();
})();
