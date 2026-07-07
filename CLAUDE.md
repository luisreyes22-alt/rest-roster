# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DrowsyCraft (RestRoster) — a personal, unofficial Progressive Web App companion for the sleep-tracking game Pokemon Sleep. Manage a helper roster, compare investment candidates, and build optimal weekly teams. No backend: everything runs client-side, data persists in `localStorage`, deployed as a static site on GitHub Pages at https://luisreyes22-alt.github.io/rest-roster/.

## Running the app

There is no build step and no package.json. React, ReactDOM, and Babel are loaded from CDN in [index.html](index.html), and [app.jsx](app.jsx) is compiled in-browser via Babel `<script type="text/babel">`.

To preview locally, serve the directory root with any static file server (e.g. `npx serve .` or `python -m http.server`) and open `index.html` — opening the file directly (`file://`) will break fetches for `gameData.json`/`species-sprite-ids.json`.

There is no test suite and no linter configured.

## Data regeneration scripts (Node, run from repo root)

- `node scripts/build-roster.cjs` — regenerates `luis-roster.json` (gitignored, personal data) from `screenshots/_extraction-progress.json` and `screenshots/_extraction-progress-batch2.json`, validated against `gameData.json`. **Never reorder or delete entries in the extraction files** — entry order fixes each pokemon's id (`luis_<index>_<Species>`), which the app's import dedup relies on. Fix bad data in place instead.
- `node scripts/make-test-roster.cjs` — regenerates `test-roster.json` (gitignored): synthetic varied roster for exercising the UI (mixed specialties/natures/levels/shinies).

## Architecture

Everything lives in one giant client component tree in [app.jsx](app.jsx) (~1500+ lines), loaded by the 93-line shell [index.html](index.html). Key pieces top to bottom:

- **Global game data**: `GAME` (parsed from [gameData.json](gameData.json): species, subskills, natures, main skills, islands, recipes) and `SPRITE_IDS` (from [species-sprite-ids.json](species-sprite-ids.json)) are module-level mutable globals populated by an async fetch in `App()`, not React state — components read them directly (`GAME?.subskills?.[...]`).
- **Scoring model** (`scoreSubskills`, `scoreMainSkill`, `natureMods`, `totalScore`): a weighted formula combining subskill tier × slot-level weight, help frequency, and main-skill curve value, modified by nature multipliers sourced from Neroli's Lab (not guessed — see comments in app.jsx for the exact values). Subskill lock state is always derived live from `pokemon.level` vs slot level (`isSubskillLocked`), never trusted from stored data, since a stored `locked` flag goes stale once a pokemon levels up.
- **Views** (`VIEWS` enum: ADD, COMPARE, ROSTER, POKEDEX, TEAM), each a top-level component switched on in `App()`:
  - `AddView` — validated entry form (species autocomplete via `SpeciesInput`, auto-filled specialty/berry/main skill, subskill slots locked by level, undo).
  - `CompareView` — side-by-side candidate comparison feeding investment recommendations.
  - `RosterView` — persisted roster list with search/sort, edit/remove, export/import as JSON.
  - `PokedexView` — owned species overview with counts.
  - `TeamView` — island/recipe-aware team builder (`buildTeam`, `individualIngredientPool`, `expertBerryTier`, `TopDishesGallery`) that picks a balanced 5-member team and surfaces gaps.
- **Persistence**: roster is stored under `localStorage["pks_roster_v2"]`; theme under `localStorage["pks_theme"]`. `App()` owns this state and passes roster/callbacks down to views as props — there's no global store or context.
- **Offline/PWA**: [sw.js](sw.js) is a hand-written cache-first service worker; bump `CACHE_NAME` (currently `sleep-optimizer-v10`) whenever cached asset contents change, or clients will keep serving stale files. [manifest.json](manifest.json) defines install metadata.

## Docs

- [docs/ROADMAP.md](docs/ROADMAP.md) — living checkpoint of current state, known debt, and prioritized next features. Update it as decisions change rather than letting it rot; it's the source of truth for "what's next" and "why", not this file.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — user-facing explanation of scoring, ingredients, and import behavior.
