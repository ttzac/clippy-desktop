# Clippy Desktop

An animated 2D desktop companion: a living silver paperclip on a transparent, always-on-top window.
Electron shell + TypeScript + PixiJS renderer, with GitHub Releases auto-update.

## Run

```
npm install
npm start          # builds the renderer (Vite) then launches Electron
npm run typecheck
```

Auto-update is disabled when running unpackaged. `CLIPPY_SMOKE=<file.png> npm start` captures the window to a PNG and exits (dev smoke test).

## Architecture

```
src/main.js             Electron main: transparent window, click-through, drag, tray, position memory, updater
src/preload.js          contextBridge API (window.clippy)
src/renderer/
  character/            clippyShape (master silhouette), ClippyRig (deformable wire + eyes), pose (the Pose contract)
  animation/            Spring (damped oscillator), Controller (idle + drag/landing -> Pose each frame)
  ui/bubble.ts          speech bubble
  main.ts               boot, render loop, input, updater wiring
```

**Design decision: procedural vector rig, not sprite frames.** Clippy is a single polyline sampled from the master silhouette and
deformed every frame (head lean that flexes the wire, travelling ripple, squash/stretch about the base, eye/brow rig).
Animations only produce a `Pose`; the rig only consumes one. This keeps the character perfectly consistent across states,
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
| 22 other animation states, state machine, transitions | **Not started** |
| Particles/effects (Z's, steam, confetti, sparks) | Not started |
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
