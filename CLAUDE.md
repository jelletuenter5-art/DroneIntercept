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
- `identifyContact(c)` — marks identified, adds ambient to ignoredTargets
- `runPassiveScan(h)` — runs every 0.35 s, classifies anything in range

## Map / HUD
- Map overlay: `position:fixed; z-index:999`
- `#trackConfirm` popup: `position:fixed` — uses screen coordinates from getBoundingClientRect
- Thermal imaging: IRON / WHITE-HOT / BLACK-HOT palettes
- Telemetry CSV export on stop-record or on crash

## Behaviour rules (agreed with the user)
- **Classify loop:** drone flies to each *unidentified* radar contact, identifies it, adds it to `ignoredTargets` (scouts too) and moves on. No unknowns → random search waypoints (`pickSearchWaypoint`).
- **Map:** only identified contacts are drawn. Click empty map → manual waypoint (radar ignored until arrival). "✕ Waypoint" cancels and resumes search from the current position.
- **Pursuit:** click an identified contact on the map → Yes/No popup (`#trackConfirm`, z-index above the map) → `pursuitMode` chase until collision. `endPursuit()` clears it. Any collision → explosion → `resetToPad('intercept')` (needs Launch again).
- **Takeoff:** `state.takeoffT`, ~8 s: vertical climb 0–2.5 s, pitch-over to cruise 2.5–7.5 s. Launch card hides on click.
- **Flight model (active):** point-mass aircraft — airspeed `state.cruiseSpeed`, heading `rot.y`, bank `state.bank`, flight-path angle `state.gamma`; velocity always along the flight path, nose = gamma + AoA, roll = bank. Envelope consts `V_CRUISE` 69 m/s (~250 km/h), `V_DASH` 84 (~300 km/h), `V_MIN` 30, bank 65°/73°, climb/dive 22°/26°. Guidance fills `guide` (aim, alt, speed, bank).
- **Altitude planning:** one cruise altitude per leg from `routeFloor()` (max terrain on the straight route) → constant-slope climb/descent that arrives at the goal altitude; short lookahead `routePeak` only as safety.
- **Attack (`attackGuidance`):** INTERCEPT (lead to point behind target) → JOIN (onto its tail, match speed, settle above/below) → TERMINAL (collision course via `interceptTime`, offset collapses → shallow dive/climb). HEAD-ON only when CPA geometry lines up. Phase shown in Flight State.
- **Scouts** fly fixed-wing kinematics (constant speed, ≤45° bank turns) at their listed `SCOUT_SPEC` speed (no hidden multipliers); hard difficulty ×1.15.
- **Log:** `logEvent()` feed under Flight State (left); `toast()`/`radioMessage()` both write to it; entries fade after 5 s. Top toast and bottom banner are hidden.
- **Battery:** gauge sits in the bottom-left HUD box (bottom-right was under the radar). `BATTERY_WH` tuned for ~10 min. `drainBattery()` → at 0 `startBatteryFailure()` → `stepPowerLoss()` unpowered fall with momentum → crash → `resetToPad('battery')` (full battery, identifications cleared).
- **Turning:** yaw rate limited by coordinated-turn physics `g·tan(bank)/v` (≈60° bank in search, ≈75° in a chase); roll matches the turn.
