# Clippy Desktop

An animated 2D desktop companion: a living silver paperclip on a transparent, always-on-top window.
Electron shell + TypeScript + PixiJS renderer, with GitHub Releases auto-update.

## Run

```
npm install
npm start          # builds the renderer (Vite) then launches Electron
npm run typecheck
npm test            # state machine unit tests (vitest)
```

Auto-update is disabled when running unpackaged.

Tray menu > **Play animation** triggers any state for preview. Dev smoke test: `CLIPPY_SMOKE_DIR=<dir> CLIPPY_SMOKE_STATES="happy@430,sleeping@5200" npx electron .` plays each state, captures a PNG after N ms, and exits (`CLIPPY_SMOKE_TRACE=1` logs the active state; unpackaged builds expose `window.__clippy`).

## Architecture

```
src/main.js             Electron main: transparent window, click-through, drag, tray, position memory, updater
src/preload.js          contextBridge API (window.clippy)
src/renderer/
  character/            clippyShape (master silhouette), ClippyRig (deformable wire + eyes), pose (the Pose contract)
  animation/            Spring, Controller (idle + drag/landing -> base Pose), StateMachine (pure, tested),
                        states/ (interaction, ai, ambient), ease helpers
  effects/PixiFx.ts     pooled particles (sparkles, Zs, "!", shock lines) + thought-bubble prop
  ui/bubble.ts          speech bubble
  main.ts               boot, render loop, input, updater wiring
```

**Design decision: procedural vector rig, not sprite frames.** Clippy is a single polyline sampled from the master silhouette and
deformed every frame (head lean that flexes the wire, travelling ripple, squash/stretch about the base, eye/brow rig).
Each frame the `Controller` makes the base idle pose, the `StateMachine` layers active states over it (cross-faded by weight), and the rig draws the result. States only produce a `PoseMod`; the rig only consumes a `Pose`. This keeps the character perfectly consistent across states,
is resolution independent, and means new states are code + timing, not new art. A new character or pack would supply its own
rig + controller against the same `Pose` contract.

**Performance:** the ticker runs at 60 fps while anything is moving (drag, blink, hover, spring energy) and drops to 30 fps when
settled. The main process polls the cursor at 20 Hz and only sends changes. Not yet measured with a profiler (see status).

## Status

| Area | State |
|---|---|
| Transparent frameless always-on-top window | Done |
| Click-through outside character/bubble | Done (bounding-box hit test, not pixel-accurate) |
| Drag with lean/stretch, bouncy landing, remembered position | Done |
| Cursor-following eyes (global cursor), blinks, saccades, breathing, float | Done |
| Tray icon + show/hide/update/quit | Done |
| Auto-update via GitHub Releases + release workflow | Done, untested end to end |
| Idle animation | Done (first pass; art direction still to polish) |
| State machine: priorities, interruption, cooldowns, min/extend duration, redirect (sleeping -> shocked), cross-fade | Done, 9 unit tests |
| States: curious, happy, thinking, talking, sleeping, shocked, dragging | Done, captured and reviewed in Electron; not yet judged in motion by a human at 60 fps |
| Triggers: hover -> curious, click -> happy, 3 fast clicks -> shocked, 2 min of no cursor movement -> sleeping (wakes on cursor movement), bubble text -> talking | Done |
| Particles: sparkles, Zs, "!", shock lines, thought cloud | Done |
| Thinking "scratches head" (needs an arm/hand), typing keyboard, waking stretch | Not done: thinking is gaze + sway + thought cloud only |
| Remaining states: laughing, typing, waking, angry, confused, sad, dancing, falling, landing (partly in Controller), hiding, peeking, celebrating, listening, error, victory | **Not started** |
| Steam, confetti, sparks, question marks, sunglasses accessory | Not started |
| Personality engine (100+ lines, cooldowns, triggers) | Not started |
| AI chat, streaming, provider layer, voice, approvals | Not started |
| Fullscreen-app detection, multi-monitor testing, start with Windows, size setting, quiet mode | Not started |
| Asset validation script, audio | N/A yet (no raster assets; the character is procedural) |
| Resource measurements (CPU/GPU/RAM) | Not measured |
| Tauri migration | Deliberately not done: the Electron shell and update pipeline already work |

## Release (auto-update)

1. Bump `version` in `package.json`.
2. `git tag v0.1.1 && git push --follow-tags`.
3. The `Release` workflow builds the Windows installer and publishes it plus `latest.yml`. Installed apps check on launch and every 4 hours, download in the background, and install on quit (or via "Restart to update").

### Private repo

Installed apps need a read-only token to fetch releases. Use a fine-grained PAT (this repo, `Contents: Read`) via env var `GH_TOKEN`
or `%APPDATA%\Clippy Desktop\config.json`: `{ "updateToken": "github_pat_..." }`. Automatic checks fail silently without it;
manual checks (tray menu) show the error. Making the repo public and removing `"private": true` from the `publish` block removes the need.

Installers are unsigned, so Windows SmartScreen warns on first install.
