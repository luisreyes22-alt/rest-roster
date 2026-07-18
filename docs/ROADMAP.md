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

### 2. Team Builder v2: multi-axis scoring + best-achievable-dish (agreed 2026-07-08)
The earlier "+4 tiebreak" fix didn't dethrone Sango because it isn't a tie:
Sango's raw totalScore (52.1) leads the #2 skill specialist by 8.7 points,
driven by Charge Strength M Lv.7's curve (7.79, steepest in the game data,
worth 15.6 pts vs Ingredient Magnet S Lv.7's 8.0) — the formula scores skill
*growth curves*, not skill *function*, and the reserved "Skills / Utility"
slot hands the seat to the top scorer unconditionally.

Redesign (decisions confirmed with Luis):
- **Four axes per candidate**: Dish (estimated needed-ingredients/HOUR for
  the target recipe: helps/hr × ingredient% × matching level-gated slots —
  production rate, not binary can/can't), Cooking-support skills (main
  skills classified by FUNCTION: magnet/draw/pot-size/tasty-chance/assist =
  cooking; E4E/cheer/charge-energy = sustain; Extra Helpful/Helper Boost =
  helper; Charge Strength/Berry Burst = strength; shards/metronome/etc =
  neutral — curve value × function weight), Berry (island match × berry
  output), Meta (species tier from RaenonX's community tier list, kept as a
  small local meta-tiers.json snapshot refreshed manually — no backend).
- **Fixed dish-first weights**: Dish > cooking-support > berry > meta.
  Meta is a light tiebreak between otherwise-similar picks, per Luis.
- **No reserved slots**: greedy pick of 5 with MARGINAL dish value — each
  pick decrements expected coverage of the recipe's remaining ingredient
  demand, so redundant stackers lose value and coverage wins. Any specialty
  can fill any seat (a Berries mon that feeds the dish beats an Ingredients
  mon that doesn't). Roles become descriptive labels of each pick's
  dominant axis; pickReason keeps the numbers for auditability.
- **Best-achievable-dish mode**: evaluate every recipe as (recipe value ×
  roster's real expected coverage), recommend the best dish+team combos
  instead of making Luis guess which dish to select.
- Sango note: he still earns herb-dish seats honestly (Ingredient Finder M,
  fast helps, Fiery Herb×2 rolls) — the fix removes his *guaranteed* seat,
  it doesn't ban him.
- Tests to freeze: monopoly regression (pure-strength mon with zero dish
  contribution can't beat a dish contributor under dish-first weights),
  coverage-beats-redundancy, marginal decay, best-dish sanity.
- Sync chore: formulas.cjs edits must be copied to formulas.js +
  public/formulas.js (see header comment in formulas.cjs).
- Estimate: 1-2 sessions (axes+greedy first, then best-dish, then meta
  tiers seeding).

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
- 2026-07-17: bugfix - regular "Greengrass Isle" (not Expert Mode) also draws
  3 favorite berries weekly in-game (1 main + 2 sub, same draw shape as
  Expert Mode) but with NO random bonus category - each favorite berry just
  doubles its own base value/strength, no speed change. The team builder
  previously had no way to take this into account (the island was modeled as
  a flat "accepts all berries", so picking no berries meant the berry axis
  ignored which 3 berries actually dropped that week). Added
  `weeklyBerries: true` to gameData.json's "Greengrass Isle" entry (distinct
  from "Greengrass Isle (Expert Mode)"'s `expert: true`), reused the existing
  3-berry-picker UI (mainBerry/subBerry1/subBerry2 state) without the
  random-bonus dropdown, and doubled the flat berry-axis bonus in
  `buildTeam`'s `berryAxis` for a matching mon. See formulas.js/.cjs,
  public/formulas.js, app.jsx's TeamView, and the new tests in
  tests/formulas.test.cjs.
- 2026-07-17: Team Builder audit (docs/AUDIT_TEAM_BUILDER_2026-07-17.md) run
  against RaenonX/Neroli's Lab/Serebii mechanics to check whether the
  recommended team is actually optimal. Phase 1 fix landed: nature's speed
  modifier was being double-counted. `p.frequency` is entered straight off
  the Pokemon's in-game info screen, which the game already computes with
  level, nature AND subskills applied (only energy is excluded) - confirmed
  by the game's own display behavior (a neutral nature shows unchanged speed
  only because its equal buff/nerf cancel, which is meaningless unless
  nature is already baked into what's shown) and by the app's own form
  copy ("Auto-filled with the species base - adjust it if your Pokémon
  differs"). `totalScore`, `ingredientRate`, `ingredientRatesByName`, and
  `buildTeam`'s `baseAxis` were all re-multiplying `natureMods().speed` into
  helps/hour on top of that already-modified frequency, silently inflating
  every +speed mon's estimated output (and deflating every -speed mon) by
  ~10%. Removed the redundant multiplication everywhere helps/hour is
  computed; `mods.speed` still exists on `natureMods()` for reference but
  must never be multiplied into a rate again. `mods.skill` (main-skill
  chance) and `mods.ing` (ingredient finding) are untouched - those aren't
  reflected in the displayed frequency. Added a regression test pinning a
  Speed-of-help nature (paired with an Energy-recovery nerf, which this
  score model doesn't touch) to produce identical helps/hour as a neutral
  nature at the same stored frequency. Remaining audit phases (real-unit
  berry/skill axes, energy modeling, team-level legendary synergies like
  Helper Boost/Bad Dreams, greedy+swap search) are tracked in the audit doc,
  not yet started.
- 2026-07-17: Team Builder audit phase 2 landed - berry and skill axes now
  score in real per-hour units instead of arbitrary points, sourced from
  Neroli's Lab (common/src/utils/rp-utils/rp.ts berryFactor/skillFactor,
  common/src/utils/stat-utils/stat-utils.ts
  calculateNrOfBerriesPerDrop/calculateSkillPercentage - not guessed).
  `berryRate(p)`: berries/help now depends on specialty (Berries/All find 2,
  others 1) plus Berry Finding S (+1), berry value now scales with the
  PRODUCING pokemon's level via the game's actual max(linear, compounding)
  curve (previously assumed flat per-berry value - level scaling was a real
  gap, not the guess the original audit worried about), and a help proc is
  either an ingredient proc or a berry proc, never both, so berry throughput
  scales with `(1 - ingredientChance)`. `skillActivationRate(p)`: activations/
  hour from species `skillPercent` x nature x Skill Trigger S/M subskills
  (+18%/+36%, additive, same shape as Ingredient Finder) - `cookingSkillScore`
  now multiplies this real activation rate into the curve-value x
  function-weight score instead of only ranking by curve position, so two
  mons with the same main skill no longer score identically regardless of how
  often either actually fires. Also discovered while reading Neroli's Lab
  source: favorite-berry doubling isn't Greengrass/Expert-only - a FIXED
  island's 3-berry list is itself a standing favorite set (only Greengrass
  redraws weekly), so `buildTeam`'s berry axis now doubles for any accepted
  berry on a fixed island too, not just Greengrass/Expert matches.
  Real berry units (35-540/hr) dwarf the old arbitrary point scale, which
  would have let a strength-focused berry build always outrank real dish
  contributors even mid-recipe - `TEAM_AXIS_WEIGHTS.berry` was split into
  `berryWhenDish` (0.03, a light nudge, preserving the agreed dish-first
  priority from #2 above) and `berryWhenNoDish` (0.15, lets berries actually
  dominate a general/strength-focused build with no recipe selected).
  `skills` weight raised 0.8 -> 8 to match the new real activation-rate-scaled
  range (skills fire rarely - most mons sit under ~0.5 raw, ceiling ~2 for a
  maxed high-skillPercent specialist). The Expert Mode "random bonus
  category" multiplier (1.25x) remains an unsourced estimate - community
  material doesn't publish its exact magnitude; flagged in both the code
  comment and the audit doc as not to the same sourcing standard as the rest
  of this axis. Added regression tests for berry value level-scaling,
  berries-per-drop by specialty/Berry Finding S, Skill Trigger M/nature
  raising activation rate, and fixed-island favorite-berry doubling. All 23
  formula tests pass. Energy modeling (audit finding B) and team-level
  legendary synergies (finding F) remain unstarted.
- 2026-07-17: Team Builder audit phase 3 landed - Helper Boost
  (Raikou/Entei/Suicune) team synergy now actually influences which Pokemon
  `buildTeam` picks, not just a post-hoc note. The greedy loop is
  forward-only and can't see that a candidate's Helper Boost value depends on
  teammates picked AFTER it, so a bounded local-search pass runs once the
  greedy team is built: it re-evaluates whole 5-member sets (reusing the
  exact same dish/skills/berry math against a fresh local demand/decay state,
  see `evaluateTeamSet`) and swaps in a bench candidate whenever it raises the
  team's total, capped at 2 passes. `HELPER_BOOST_TABLE` (Serebii-sourced,
  helps-per-activation by skill level x same-type teammate count) drives
  `helperBoostAxisBonus`, which distributes the extra helps/hour evenly
  across the team (undocumented in-game which teammate "gets" a given help,
  so this is a stated assumption) and folds them into each member's own
  dish/skills/berry axis value in proportion to how much their OWN helps/hour
  would grow - deliberately avoids inventing a cross-unit "helps to axis
  points" conversion constant. Verified with a controlled test: holding a
  candidate's own stats completely constant, it loses its seat to a
  type-matching alternative only when Helper Boost is active on the carrier,
  proving the swap is driven by the synergy and not incidental stat
  differences. Guarded behind `roster.some(mainSkill === "Helper Boost")` so
  rosters without a Helper Boost carrier (the common case) skip the expensive
  pass entirely - cut `bestAchievableDish` on a 154-mon test roster (Luis's
  real roster, which has 3 Entei/2 Suicune/1 Raikou/2 Cresselia/1 Darkrai)
  from ~1.7s to ~250ms for non-legendary rosters, ~1.6s when Helper Boost is
  present (76 recipes each).
  Bad Dreams (Darkrai) and Lunar Blessing (Cresselia) are surfaced as
  qualitative `result.tips` strings instead of scored - both need an energy
  model (audit finding B) to quantify honestly, which this codebase doesn't
  have yet, and this project's standing rule is real formulas, not guessed
  magnitudes. Helping Bonus subskill (-5% team frequency per holder, sourced
  exactly from Neroli's Lab) also gets a qualitative tip rather than a scored
  axis change, since its interaction with each holder's own 35% subskill
  speed cap would need decomposing their displayed frequency back into
  base/nature/subskill components to model precisely - deferred, not guessed.
  New `result.tips` array rendered in TeamView (app.jsx) alongside the
  existing `warnings` block, visually distinct (info-blue vs warning-amber).
  Added 6 regression tests (Helper Boost table lookup, the controlled
  stat-held-constant swap test, tip generation for Helper Boost/Bad
  Dreams/Lunar Blessing/Helping Bonus, subskill-lock gating). All 29 formula
  tests pass. Energy modeling (B) remains the one unstarted audit item;
  Bad Dreams/Lunar Blessing/Helping Bonus quantification is now explicitly
  blocked on it rather than silently missing.
