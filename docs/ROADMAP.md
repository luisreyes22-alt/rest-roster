# DrowsyCraft — Roadmap & Android/Play Store guide

_Last updated: 2026-07-07. Working plan agreed with Luis; update it as
decisions change instead of letting it rot._

## Where we are (checkpoint)

- **Product**: personal Pokemon Sleep companion PWA. Tabs: Add (validated
  entry with species autofill, ingredient rolls, undo), Compare, Roster
  (154 real Pokemon, search/sort, collapsible cards), Pokedex (owned species
  with counts), Team (island + expert-mode builder, Top Dishes gallery).
- **Scoring is honest**: locked subskills derived from level, natures with
  real multipliers from Neroli's Lab source, score shown on cards,
  level-gated ingredient matching.
- **Architecture**: index.html (93-line shell) + app.jsx (~1,550 lines,
  React via in-browser Babel, no build step, no tests), gameData.json,
  sw.js (offline-first, v10), deployed on GitHub Pages:
  https://luisreyes22-alt.github.io/rest-roster/
- **Data**: localStorage per device; luis-roster.json (gitignored) rebuilt
  by scripts/build-roster.cjs.
- **Known debt**: no unit tests (score rounding frozen only by habit),
  Babel-in-browser slow on cheap phones, localStorage fragile (no backup
  nudges).

## Next features (priority order)

### 1. Shiny support (Omar's feedback — small, do first)
- "Is shiny" toggle in Add/Edit (today the flag only exists on
  screenshot-imported entries; manual entry can't set it). Sparkle marker
  on cards and Pokedex tiles.
- Shiny sprites: PokeAPI repo has `sprites/pokemon/other/home/shiny/{id}.png`
  — same id map. `spriteUrl(species, isShiny)`; Pokedex tile goes shiny if
  any owned copy is shiny.
- Estimate: one short session.

### 2. Team Builder fairness: skill-specialist pick considers ingredients
Observed: Sango (Ampharos) lands in almost every team — the "Skills /
Utility" slot picks purely by score, so the same top skill mon monopolizes.
- When a dish is selected, the skill-specialist slot should weigh that
  candidate's ingredient coverage of the recipe (level-gated individual
  pool) as a tiebreak/bonus, so a slightly lower-scored skill mon that
  actually feeds the dish can win the slot.
- Also worth adding while in there: a small "why this over the runner-up"
  hint in the role tag tooltip, so picks stay explainable.
- Estimate: half a session, mostly in `buildTeam()`'s pick logic + tests
  once the test foundation exists.

### 3. Berry icons in Expert Mode pickers
Users don't know berries by name. Native `<select>` can't render images, so
replace the 3 berry dropdowns with a chip/grid picker showing berry sprites
(PokeAPI item sprites: `sprites/items/{slug}-berry.png`, e.g. `oran-berry`)
+ name. Needs a small berry-name→slug map (18 berries). Follow existing
design tokens; reuse the disabled/dedup logic the selects have today.
- Estimate: half a session.

### 4. Pokedex expansion: full dex, filters, regions
- Show ALL Pokemon Sleep species (232 in gameData), not just owned — owned
  tiles full color with count badge, unowned grayed/silhouette style.
  (Supersedes the earlier "owned only" decision — Luis changed it.)
- Filter bar: Owned / All / Missing; possibly specialty filter later.
- Group by region with section headers, derived from pokedexNumber ranges:
  Kanto 1–151, Johto 152–251, Hoenn 252–386, Sinnoh 387–493, Unova 494–649,
  Kalos 650–721, Alola 722–809, Galar 810–905, Paldea 906+. (Forms like
  Alolan/Paldean keep their base dex number — they'll sit with their line.)
- Estimate: one session.

### 5. Compare from roster: same-species duels
Compare is entry-form-only today. Add a roster-driven path:
- In the Pokedex expanded species panel (and/or Roster), when you own 2+ of
  a species, a "COMPARE THESE X" button loads them straight into the
  Compare tab.
- Compare view needs to accept roster members (it already renders
  PokemonCards with rank badges — mostly wiring + a "clear" that doesn't
  touch the roster).
- Estimate: half a session.

### 6. Weekly results board (Omar's feedback — the big one)
Replaces the manual log kept since Aug 2024 (~100 weeks, 3 players: Omar,
Luis, Jeriel). Reference implementation + full seed data:
`C:\Users\luisr\Downloads\PokemonSleepBoard.jsx.tsx` (a Claude artifact —
DO NOT port directly: Tailwind/recharts/lucide/window.storage don't exist
here. Rebuild with our tokens; no emojis, Tabler icons).

Keep these concepts from it:
- Week entries: date-range label, island, winner(s) (ties split 0.5),
  optional dish type / winner RP / closeness margin / note.
- Standings, current + best streaks, wins-by-island chart, dish counts,
  RP records; shiny logbook per player with pre-history base counts.

Implementation plan:
- New "Board" tab. Own localStorage key + the same export/import JSON
  pattern as the roster (each device keeps a copy; one person is the
  scribe — no backend, consistent with the individual-use decision; the
  Board is the shared *scoreboard* they already keep, not rival rosters).
- `scripts/convert-board-seed.cjs`: parse SEED_WEEKS from the artifact into
  `board-history.json` (**gitignore it** — personal data). Island code map:
  P = "Old Gold Power Plant", Exp = "Greengrass Isle (Expert Mode)",
  Mix stays a special value.
- Charts as plain CSS bars (RadarBar-style), no chart library.
- Estimate: 2 sessions (data model + CRUD + standings; then stats/streaks/
  shiny log + polish).

### 7. Testing foundation (before Play Store work)
- Extract pure functions (totalScore, scoreSubskills, natureMods,
  individualIngredientPool, buildTeam pick logic) into a module tested with
  `node --test` — no framework install. Freeze the component-rounding
  behavior in a test. First step toward a real build; on the critical path.

### 8. Build step (Vite) — before Android packaging
- Replace Babel-in-browser with a Vite build. Faster cold start on phones
  (Play pre-launch reports flag this), enables modules/tests properly.

## Android / Play Store guide (Luis's homework)

**Chosen path: TWA (Trusted Web Activity) via Bubblewrap.** The app is
already an installable PWA on HTTPS — TWA wraps exactly that, one codebase,
and teaches the standard web→Android pipeline. Capacitor only if native
APIs become necessary. React Native = rewrite, rejected.

### ⚠️ Legal reality, read first
Pokemon is The Pokemon Company's IP and they enforce aggressively. A public
Play listing built around Pokemon Sleep, showing Pokemon artwork (PokeAPI
sprites are copyrighted art), is likely to be rejected or taken down —
possibly with a developer-account strike. **Target: Internal/Closed testing
tracks** (private, invite-only, up to 100 testers) — the full Play Console
pipeline (signing, review, releases) without the takedown risk. A future
truly-public app should be original IP; everything learned transfers.

### One-time setup
1. **Google Play Console**: play.google.com/console → personal developer
   account, $25 one-time, ID verification. Note: new personal accounts must
   run a closed test with 12 testers for 14 days before any production
   release — irrelevant on testing tracks, but know it exists.
2. **Install**: JDK 17 (Temurin), Android Studio (SDK + emulator), then
   `npm i -g @bubblewrap/cli` (it can also download its own JDK/SDK).
3. **Privacy policy URL**: required even for zero-collection apps. A
   one-paragraph page on the Pages site ("all data stays on your device")
   suffices.

### PWA polish before wrapping (Claude work, listed for planning)
- **Maskable icon**: current icons are a raw photo marked "any maskable" —
  Android will crop it. Make a proper maskable variant (pug face centered
  in safe zone, padded background).
- **assetlinks.json** at `.well-known/assetlinks.json` on the Pages site so
  the TWA runs full-screen (Bubblewrap generates the fingerprint).
- Lighthouse PWA clean pass; store screenshots; Vite build first (above).

### Packaging loop
```
bubblewrap init --manifest https://luisreyes22-alt.github.io/rest-roster/manifest.json
bubblewrap build   # produces signed .aab/.apk + keystore
```
- **Back up the keystore + passwords outside the repo** — losing it means
  never updating the app again.
- Play Console → create app → upload .aab to **Internal testing** → add
  tester emails (Omar, Jeriel) → install via link. Web deploys update
  content instantly; only manifest/icon/URL changes need a new .aab.

### "Mudarnos a proyecto" — working setup going forward
1. Open Claude Code **in the repo folder**
   (`C:\workspace\personal\pokemon-sleep\rest-roster`) so sessions get
   project-scoped memory/settings.
2. First session there: `/init` to create CLAUDE.md, then move the
   conventions into it: verify in preview before commit; never push without
   asking; bump sw.js CACHE_NAME on app changes; dated session-log bullet
   in USER_GUIDE.md; scripts/build-roster.cjs is the only way to regenerate
   the roster; design tokens only, no hardcoded hex, no emojis; game
   formulas come from nerolis-lab source, never guessed.
3. `.claude/settings.json` allowlist for node/git basics to cut permission
   prompts.

## Decision log
- 2026-07-06: rival-roster features rejected — individual use. (The Board
  is the shared scoreboard they already keep, not that.)
- 2026-07-07: TWA/Bubblewrap over Capacitor/RN; target Play testing tracks,
  not public production (Pokemon IP risk).
- 2026-07-07: tests + Vite build ordered before Android packaging.
- 2026-07-07: Pokedex switches from owned-only to full dex with filters +
  region grouping (user decision, supersedes 2026-07-06 choice).
