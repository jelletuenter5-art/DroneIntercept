# DroneIntercept — Alpine Drone Lab

A single-file Three.js drone simulator game.

## Key facts
- **Main file:** `index.html` — all game code lives in one `<script type="module">` block inside it
- **Renderer:** Three.js WebGL with ACES filmic tonemapping, instanced meshes for forests
- **Physics:** 120 Hz fixed-step, interpolated rendering
- **Terrain:** FBM fractional Brownian motion via `terrainHeight(x, z)`

## Drone flight model
- `modeBlend`: 1 = VTOL hover (nose up), 0 = cruise (nose forward) — coupled to airspeed
- `state.launchStage`: `parked` → `takeoff` → `active`
- `craftInner` group inside `craft` group handles model orientation

## AI / contacts
- `scouts[]` — spawnable enemy scouts (light/heavy/fast)
- `ambientActors[]` — birds and airliners (classify-only, never engage)
- `state.pursuitMode` — false = classify loop, true = user-selected pursuit
- `state.ignoredTargets` Set — contacts drone won't re-approach
- `identifyContact(c)` — forces a confident, *correct* classification (used for tests); normal play classifies via `classifyTick`
- `radarScan(h)` — every 0.35 s: radar detection (`c.detected`), track update (`c.trk`), classification readings

## Map / HUD
- Map overlay: `position:fixed; z-index:999`
- `#trackConfirm` popup: `position:fixed` — uses screen coordinates from getBoundingClientRect
- Thermal imaging: IRON / WHITE-HOT / BLACK-HOT palettes
- Telemetry CSV export on stop-record or on crash

## Behaviour rules (agreed with the user)
- **Classify loop:** drone investigates radar contacts (`c.detected`) not yet classified to ≥85 %; done when conf ≥ .85, a close look (< ½ classify range) or 45 s → `ignoredTargets`. No candidates → random search waypoints (`pickSearchWaypoint`).
- **Radar & tracks:** `radarRange()` 1.5 km clear / 1.2 mist / 0.9 rain, terrain-masked (`losPoint`). Track `c.trk` {pos, vel, turn rate w, seen, lost}. Off radar: `trackPos()` dead-reckons along the measured turn (30 s) then straight; `trackSigma()` grows to ~1.5 km (rough guess after ~3-4 min). Track dropped when the whole uncertainty area is swept and empty for 2 s (or 10 min old). Pursuit of an undetected target flies to the estimate (phase 'search'); dropped track ends pursuit.
- **Classification:** `classifyTick` noisy readings, quality = range × `sensorQuality()` (thermal vs camera, daylight, weather); confusions `CLS_CONFUSE`; votes → `c.guess` + `c.conf`; identified at ≥ 60 %; reclassification logged. Map/HUD/popup always show guess + %, never truth. Collision with airliner/birds = CIVILIAN INCIDENT (+ Mission Status counter). Big bottom-centre TERMINATE button during pursuit (key X).
- **Map:** radar coverage ring; live tracks solid, estimates faded with dashed uncertainty circle + age; unclassified = grey fuzzy blip (not selectable); classified = guess + % (threat guesses orange). Click empty map → manual waypoint (radar ignored until arrival). "✕ Waypoint" cancels and resumes search from the current position.
- **Pursuit:** click an identified contact on the map → Yes/No popup (`#trackConfirm`, z-index above the map) → `pursuitMode` chase until collision. `endPursuit()` clears it. Any collision → `impact()`: both explode and vanish → slow-motion replay → `resetToPad('intercept')` (needs Launch again).
- **Takeoff:** `state.takeoffT`, ~8 s: vertical climb 0–2.5 s, pitch-over to cruise 2.5–7.5 s. Launch card hides on click.
- **Flight model (active):** point-mass aircraft — airspeed `state.cruiseSpeed`, heading `rot.y`, bank `state.bank`, flight-path angle `state.gamma`; velocity always along the flight path, nose = gamma + AoA, roll = bank. Envelope consts `V_CRUISE` 69 m/s (~250 km/h, efficient search), `V_DASH` 111 (400 km/h, pursuit only), `V_MIN` 30, bank 65°/73°, climb/dive 22°/26° (pursuit ~31°/37°). Guidance fills `guide` (aim, alt, speed, bank, track/tau/ff for pursuit altitude).
- **Altitude planning:** one cruise altitude per leg from `routeFloor()` (max terrain on the straight route) → constant-slope climb/descent that arrives at the goal altitude; short lookahead `routePeak` only as safety.
- **Attack (`attackGuidance`):** rear-slot steering — aim at a point riding behind/beside the target on its *predicted turn arc* (`predictContact`/`solveRendezvous`), weight `wL` fades to 0 once committed behind (`commit`: behind AND same heading; inside 450 m rear half is enough) → collision course. Speed: braking-limited closure when behind (`sqrt(2·4·(R-22))+6`), turn-radius-fitted speed while converting. Altitude: copy target climb rate (`ff`) + null height error by arrival (`tau`), side offset (above 70% / below) collapses to 0 inside 40 m. HEAD-ON only when CPA geometry lines up. Phase label (INTERCEPT/JOINING TAIL/CLOSING IN/HEAD-ON) in Flight State.
- **Benchmark:** deterministic 30-geometry engagement test (targets start 0.9–2.2 km, i.e. often beyond radar): 30/30, mean ≈36 s, ≈10 % battery, 0 S-shapes; also 30/30 at 6 and 13 m/s wind. Re-run something similar after touching guidance.
- **Anti-weave:** close-in augmented proportional navigation (`G.rateCmd`), gentle braking-limited closure (slower while target turns), bank-reversal detection → settle at Vt+3.
- **Scouts** fly fixed-wing kinematics: constant speed, ≤30° bank, roll rate ~20°/s, climb ≤~8°, at their listed `SCOUT_SPEC` speed (no hidden multipliers); hard ×1.15. Waypoints inside their turn circle are flown past (no endless orbiting); waypoints kept within ±2200 m.
- **Log:** `logEvent()` feed under Flight State (left); `toast()`/`radioMessage()` both write to it; entries fade after 5 s. Top toast and bottom banner are hidden.
- **Battery:** gauge sits in the bottom-left HUD box (bottom-right was under the radar). Power = `flightPower(V, bank, vs)` ∝ V^2.3 (drag) + turn load + climb; `BATTERY_WH` tuned for ~10 min of search, ~4 min of continuous 400 km/h dash. `drainBattery()` → at 0 `startBatteryFailure()` → `stepPowerLoss()` unpowered fall with momentum → crash → `resetToPad('battery')` (full battery, identifications cleared).
- **Turning:** yaw rate limited by coordinated-turn physics `g·tan(bank)/v` (65° bank in search, 73° in a chase); roll matches the turn.
- **Mission Status (top right):** THREATS LEFT (scouts flying) · IDENTIFIED THREATS · TOTAL IDENTIFIED (scouts + birds + airliners).
- **Wind:** `updateWind()` mean (auto per weather `WEATHER_WIND`, or Environment panel) + gusts + vertical turbulence in `wind` vector. Drone, scouts (`s.vel` = ground velocity; air = `s.hdg`/`s.spd`) and airliners drift; `crabHeading()` corrects crosswind; search airspeed +0.45×headwind. HUD: airspeed + GS; header shows time, weather, wind.
- **Environment panel** (☁ button): weather Auto/fixed, wind auto/speed/from-direction, gusts, time of day (manual or running). `env` object.
- **Replay:** `recordFrame` 30 Hz ring buffer (8 s) of drone + objects within 500 m. `impact()` freezes it into `state.lastReplay`; `startReplay` pauses sim, `stepReplay` plays: real-time chase cam → ×0.4 side cam (3 s before impact) → ×0.15 impact cam (last 1 s) → explosion hold. Space/Esc/click skips. "⟲ Replay last impact" button. HUD hidden (`body.replaying`).
- **Free camera:** orbit relative to smoothed heading, eased targets + drag inertia, exponential wheel zoom (6–260 m), double-click resets.
