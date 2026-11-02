# Test tools for Alpine Drone Lab

Headless checks for `index.html`: syntax, a smoke test, the pursuit benchmark, landing tests, a civil-traffic check
and model screenshots. Each tool builds a *test copy* of the game in `tools/.build/` (local Three.js, seeded random
numbers, game internals exposed on `window.__t`), serves it locally and drives it in headless Chromium. The game
itself is never modified.

## One-time setup

You need [Node.js](https://nodejs.org) 18 or newer. Then, in this folder:

```bash
cd tools
npm install
npx playwright install chromium
```

`npm install` fetches Playwright (headless browser control), acorn (JavaScript parser) and Three.js 0.160 (so the
test copy doesn't depend on the CDN).

## Tools

| Command | What it does | Time |
|---|---|---|
| `node check-syntax.js` | Parses the game's module script; prints the line of any syntax error. | 1 s |
| `node smoke.js` | Loads the page (must have no console errors), launches, flies 200 s autonomously with full traffic; reports crashes, stalls, lowest height, identifications; screenshot → `out/smoke.png`. | ~1 min |
| `node bench.js` | Pursuit benchmark: 30 deterministic chases (10 per scout type, 0.9–2.2 km out, often beyond radar). Hits, time, battery, weave detections, near-miss passes. | 3–6 min |
| `node landing.js` | Return-to-base from 3.5 km, 8 runs each at 0/8/13 m/s wind: on/off pad, distance from centre, landing time. | 3–5 min |
| `node traffic.js` | 30 simulated minutes of civil traffic: bank, turn radius, pitch, climb rate, airliner course changes, light-aircraft coverage and lowest height. | ~2 min |
| `node separation.js` | Mid-air avoidance & collisions: 40 collision-course encounters (every type pair, head-on/crossing/overtake) must be avoided; an unavoidable head-on must explode both; a 95-scout crowd (collisions, stuck circling, NaNs, ms per step); 24 scouts converging on one point, with and without avoidance. `--crowd --minutes --area --band --noavoid` | ~4 min |
| `node shots.js` | Close-ups of every aircraft model and the drone → `out/models.png` + one PNG per view. | ~1 min |
| `npm test` | Quick set: syntax + smoke + 15-chase benchmark + 12 landings. | ~5 min |

Options:

```bash
node bench.js --wind 13            # wind speed in m/s (default 0)
node bench.js --n 60 --kinds fast  # number of chases, scout types to use
node bench.js --ref HEAD~3         # benchmark an older commit, to compare before/after a change
node bench.js --verbose            # one line per chase
node landing.js --winds 0,13 --per 4
node smoke.js --seconds 300 --seed 3 --render 0   # --render 0 skips the real-time screenshot
node traffic.js --minutes 60 --wind 10
```

Runs are reproducible: the benchmark and landing tests stop the render loop so only the physics uses the seeded
random numbers. Note that the outcome of chase *i* also depends on the chases before it (shared world), so
`--n 15` and `--n 30` agree on the first 15.

## Reference results (Nov 2026, 1.2 m drone, real-size aircraft)

- Benchmark: 30/30 at 0, 6 and 13 m/s wind (mean ≈ 37 / 33 / 32 s, ≈ 18–20 % battery, weave detections in 3–5 runs,
  0–2 near-miss passes). A miss can also be a radar *track loss* (target off radar, estimate dropped). Aim for
  ≥ 25/30 and few weave detections.
- Landing: 24/24 on the 6.5 m pad, within ~0.6 / 1.4 / 1.8 m of centre at 0 / 8 / 13 m/s wind.
- Traffic: airliners ≤ 25° bank (≥ 2.8 km turn radius), course changes ≤ 35°, climb ≤ 8 m/s; light aircraft 30° bank
  (~600 m radius), pitch ≤ 5°, climb ≤ 4.5 m/s, roam most of the map.

## Notes

- Headless Chromium uses software rendering (SwiftShader), so the real-time parts (smoke screenshot) run at ~1 fps.
  That's expected; the physics tests don't render.
- If Playwright's own browser can't be installed, point the tools at an installed Chrome/Chromium:
  `CHROMIUM_PATH=/path/to/chrome node smoke.js`.
- If you add new internals that a test needs, add the name to `EXPOSE` in `lib.js`.
