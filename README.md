# 🌙 RestRoster

A Progressive Web App (PWA) companion for sleep-tracking games — manage your helper roster, compare investment candidates, and build optimal weekly teams.

**Live app:** https://luisreyes22-alt.github.io/rest-roster/

## Features

- **➕ Smart Data Entry** — Species autocomplete with auto-filled specialty, berry, and main skill. Nature picker shows stat effects instantly. Subskill slots lock automatically based on level.
- **⚔️ Investment Comparator** — Rank candidates with a weighted scoring model (subskill tiers × slot weights + help frequency) and get a clear investment recommendation.
- **📋 Persistent Roster** — Saved locally on your device. Edit, remove, export/import as JSON for backup or sharing.
- **🏝️ Weekly Team Builder** — Select the week's island and get an optimal 5-member team balanced across specialties, with warnings for gaps (missing ingredient support, low berry synergy, etc.).
- **📱 Offline-First PWA** — Installable on Android/iOS home screen. Works fully offline after first load thanks to an embedded game database and service worker caching.

## Tech Stack

- React 18 (via CDN, no build step)
- Vanilla service worker (cache-first strategy)
- localStorage persistence
- Embedded JSON game database
- Hosted on GitHub Pages

## Install on Your Phone

1. Open the live URL in Chrome
2. Tap ⋮ menu → **"Add to Home Screen"** / **"Install app"**
3. Launch from the home screen icon — works offline ✈️

## Project Structure

```
index.html      → Full app (React, single file)
gameData.json   → Embedded game database (species, subskills, natures, islands)
sw.js           → Service worker (offline caching)
manifest.json   → PWA manifest
icon-192.png    → App icon (small)
icon-512.png    → App icon (large)
```

## Roadmap

- [ ] Recipe database + pot capacity in Team Builder
- [ ] IndexedDB migration for larger rosters
- [ ] Playwright E2E test suite
- [ ] Weekly competition tracker (head-to-head mode)

## Disclaimer

This is an unofficial fan-made tool for personal use. Not affiliated with, endorsed by, or connected to any game developer or publisher. All game names and assets belong to their respective owners.

---

*Built with Claude as a personal project to explore PWA development.*
