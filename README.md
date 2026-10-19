# Clippy Desktop

Electron base app: transparent, frameless, always-on-top desktop buddy with GitHub Releases auto-update. UI in `src/renderer/` is a placeholder.

## Dev

```
npm install
npm start
```

Auto-update is disabled when running unpackaged.

## Release (auto-update)

1. Bump `version` in `package.json` (e.g. `0.1.1`).
2. Commit, then `git tag v0.1.1 && git push --follow-tags`.
3. The `Release` workflow builds the Windows installer and publishes it (plus `latest.yml`) to a GitHub Release. Installed apps check on launch and every 4 hours, download in the background, and install on quit (or via "Restart to update").

## Private repo note

The repo is private, so installed apps need a read-only token to fetch releases. Give each machine a fine-grained PAT (this repo only, `Contents: Read`) via either:

- env var `GH_TOKEN`, or
- `%APPDATA%\Clippy Desktop\config.json`: `{ "updateToken": "github_pat_..." }`

If the repo is made public, no token is needed: remove `"private": true` from the `publish` block in `package.json`.

## Unsigned builds

Installers are not code-signed, so Windows SmartScreen will warn on first install. Auto-update still works.
