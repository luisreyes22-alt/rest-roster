# Team Builder Audit — 2026-07-17

Scope: `buildTeam` / `bestAchievableDish` and every axis feeding them (formulas.js),
audited against community-established mechanics (RaenonX wiki, Neroli's Lab source
code, Serebii, Game8). Goal: is the recommended 5-mon team actually the best
possible combination, and in what order are berries / skills / ingredients
considered?

## 1. How the builder decides today (actual order of consideration)

There is **no sequential order** (berries-then-skills-then-ingredients). Every
candidate gets one weighted sum across five axes, and 5 picks are made greedily.
Updated 2026-07-17 (phase 2) - berry and skill are now real per-hour units, not
arbitrary points:

| Axis | Raw range | Weight | Effective priority |
|---|---|---|---|
| dish (needed ingredients/hr, marginal vs remaining demand) | ~0–2.5 | 12 | 1st — dominates (~0–30 pts) |
| skills (real activations/hr × curve value × function class × stack decay) | ~0–2 | 8 | 2nd (~0–16 pts) |
| berry (real Snorlax-strength units/hr × favorite doubling) | ~35–540 | 0.03 w/ recipe, 0.15 w/o | 3rd w/ recipe (~1–16 pts); dominates w/o recipe (~5–81 pts) |
| base (subskills + helps/hr floor) | ~0–45 | 0.15 | tiebreak (~0–7 pts) |
| meta (community tier) | 0–4 | 0.4 | tiebreak (~0–1.6 pts) |

After each pick: remaining recipe demand is decremented by the pick's expected
8-hour production (so redundant producers fade), and repeated skill functions
decay ×0.6. This is a sound greedy-marginal design for the dish-first goal, and
the regression tests (monopoly, coverage-beats-redundancy) hold. The gaps are in
what the per-candidate score can *see*, not in the greedy loop itself.

## 2. Findings (vs. real mechanics)

Verified reference formula (RaenonX "Helping Frequency Formula", cross-checked
against Neroli's Lab source `energy-calculator.ts` / `member-state.ts`):

```
F = floor(baseFreq × level × nature × subskills(cap 35%, incl. team Helping Bonus)
          × goodCampTicket × ribbon × energyFactor)
energyFactor: ≥80 → 0.45 | ≥60 → 0.52 | ≥40 → 0.58 | ≥1 → 0.66 | 0 → 1.0
```

### Status: A and E done (phase 1); C and D done (phase 2)
A, C, D and E below are resolved — see the 2026-07-17 phase 1/phase 2 entries in
docs/ROADMAP.md's decision log for exact commits/reasoning. B (energy), F
(legendary team synergies), G, H, I remain open.

### A. [CORRECTNESS — likely double-count] Nature speed applied on top of measured frequency
`ingredientRate`/`baseAxis` compute `(3600/freq) × natureMods.speed`, with the
comment "frequency is the mon's measured in-game value, so Helping Speed
subskills are already baked in - only the nature speed modifier is applied on
top". But the in-game profile frequency **already includes level, nature AND
subskills** (energy excluded). Applying `mods.speed` again double-counts nature
(±10%), inflating every +speed mon and deflating every −speed mon on the dish,
base and rate axes. **Action: verify once in-game (compare a +speed mon's
displayed freq against species base × level factor), then drop `mods.speed` from
all rate math (keep `mods.ing` / `mods.skill`, which are NOT shown in profile
frequency).**

**RESOLVED 2026-07-17 (phase 1)**: confirmed via the game's own displayed behavior
(a neutral nature shows unchanged speed only because its equal buff/nerf cancel)
and the app's own form copy. Removed `mods.speed` from `totalScore`,
`ingredientRate`, `ingredientRatesByName`, `buildTeam`'s `baseAxis`, and the
`PokemonCard` helps/hour display.

### B. [MODEL GAP — big] Energy is not modeled at all
Real output scales hugely with the energy factor (0.45 at ≥80 vs 0.66 low —
~47% more helps/hr when kept above 80). The builder flags "no sustain skill" as
a warning but doesn't quantify it, so it systematically overvalues teams of
fast producers with no energy support and undervalues Energy For Everyone /
Energizing Cheer / Lunar Blessing carriers. A simple two-state day model
(fraction of day ≥80 energy vs below, shifted by sustain skills on the team)
would capture most of the effect without a full simulation.

### C. [MODEL GAP — big] Berry axis has no real units
`berryAxis` returns arbitrary points (specialist 8 / other 3 / ×2 favorite).
Real berry strength/hr = helps/hr × berriesPerHelp × berryValue(level-scaled) ×
(favorite ? 2 : 1), where berriesPerHelp = 1 (+1 if Berries specialty, +1 with
Berry Finding S subskill). None of that scales the axis today: a slow specialist
scores the same 8 as a fast one; Berry Finding S is invisible; berry value per
species is ignored. For strength-focused weeks the recommendation can be
materially wrong. **Action: compute berry strength/hr in real units as the berry
axis, and let favorites double it (all islands — see E).**

**RESOLVED 2026-07-17 (phase 2)**: `berryRate(p)` implements exactly this -
species-provided `berry.value` (gameData already has it, no new table needed)
scaled to the producing pokemon's level via Neroli's Lab's actual
max(linear, compounding) growth curve, `berriesPerDrop` handles specialty +
Berry Finding S, and berry throughput is scaled by `(1 - ingredientChance)`
since a help proc is either an ingredient or a berry proc, never both. Favorite
doubling (×2) is layered on in `buildTeam`'s `berryAxis` for all island types
(see E). Because real units (35-540/hr) dwarf every other axis, the weight was
split: a light nudge when a recipe is selected (dish stays #1 priority per the
project's dish-first agreement), full weight with no recipe selected (berries
get to actually dominate a strength-focused build).

### D. [MODEL GAP — medium] Skill axis ignores trigger rate and absolute value
`cookingSkillScore` = growth-curve position × nature.skill × function weight.
Missing: skill trigger chance per help (species-dependent, ~2–7%), Skill Trigger
S/M subskills (+18%/+36%), and helps/hr (a faster mon procs more). So a Skills
specialist with Skill Trigger M is scored identically to the same skill on a
slow mon with no trigger subskills. **Action: skillValue ≈ helps/hr ×
triggerChance × (1 + trigger subskills) × nature.skill × functionWeight ×
curve.** Species trigger % needs adding to gameData (available on RaenonX
per-species pages / Neroli's Lab data).

**RESOLVED 2026-07-17 (phase 2)**: species already carry `skillPercent` in
gameData (no addition needed) - `skillActivationRate(p)` computes activations/
hour from it x nature x Skill Trigger S/M (+18%/+36%, confirmed in Neroli's Lab
`common/src/types/subskill/subskills.ts`), and `cookingSkillScore` multiplies
that real rate into the existing curve-value x function-weight score. Note:
deliberately does NOT model the game's "pity proc" mechanic (guaranteed
trigger within N helps), so this is a conservative floor for low-skillPercent
skill mons, not the exact expected value.

### E. [DATA GAP] Favorite berries exist on EVERY island, not just Greengrass
Confirmed: favorite berries give **2× strength on all islands**; fixed islands'
favorites are effectively their fixed berry list (that's why they look "set"),
Greengrass randomizes weekly, Expert adds main/sub frequency effects on top.
Current model: fixed-island berry match awards flat points with no doubling.
Once C lands (real units), island berry match should mean "×2 strength", making
fixed islands and Greengrass weeklyBerries consistent — one code path,
`favoriteBerries` = island list (fixed) or weekly picks (Greengrass) or
main/sub draw (Expert).

**RESOLVED 2026-07-17 (phase 2)**: `buildTeam`'s `berryAxis` now doubles for
any accepted berry on a fixed island (`isFixedFavoriteIsland`), not just
Greengrass/Expert matches - one shared real-unit doubling rule instead of
three separate point systems.

### F. [MODEL GAP — legendaries] Team-level skill effects are invisible to a per-mon score
- **Helper Boost (Raikou/Entei/Suicune)**: grants instant helps to the whole
  team, scaling with the count of unique same-type species on the team (Serebii
  table: e.g. Lv6 goes 5 helps solo → 11 helps with 5 matching species). The
  builder classes it "helper ×0.6" flat — it can never discover a mono-type
  synergy team.
- **Bad Dreams (Darkrai)**: big strength but drains 12 energy from every
  non-Dark teammate per proc — a *negative* externality; combined with B it can
  make a team slower overall. Currently just "strength ×0.25".
- **Lunar Blessing (Cresselia)**: energy to all + bonus berries scaling with
  team size/berries collected — value depends on teammates.
- **Helping Bonus subskill**: −5% frequency for the WHOLE team (stacks, inside
  the 35% cap) — completely unmodeled, and it's one of the strongest team
  subskills in the game.
**Action: add a team-context bonus pass (see plan §3) rather than trying to
express these in the per-candidate score.**

**PARTIALLY RESOLVED 2026-07-17 (phase 3)**: Helper Boost is now fully
quantified and actually influences picks - see the phase 3 entry in
docs/ROADMAP.md's decision log for the swap-improvement pass design
(`evaluateTeamSet` + `helperBoostAxisBonus`) and its controlled regression
test. Bad Dreams and Lunar Blessing are surfaced as qualitative
`result.tips`, not scored - both are genuinely blocked on the energy model
(finding B) to quantify honestly; that's the next unblock, not a skipped
step. Helping Bonus is also a qualitative tip, blocked on decomposing a
member's displayed frequency back into base/nature/subskill components (to
correctly respect each holder's own 35% subskill speed cap) - deferred as
its own follow-up, not attempted with a rough guess.

### G. [MINOR] Nature speed constants slightly off
App uses ×1.1 / ×0.925 on rate; real is frequency ×0.9 / ×1.075 → rate ×1.111 /
×0.930. ~1% error — fix opportunistically when resolving A (may disappear
entirely if nature is dropped from rate math).

### H. [MINOR] `bestAchievableDish` ignores user recipe level and pot limits
Recipe value in gameData is base value; in-game the user's recipe level
multiplies it (up to ~2×+), Sunday grants extra-tasty chances, and pot size caps
which recipes are cookable at all. Ranking across recipes can therefore be
skewed toward big recipes the pot can't hold or low-level recipes. Cheap wins:
pot-size filter + optional per-recipe level input (or a global "assume level N").

**PARTIALLY RESOLVED 2026-07-17 (phase 4)**: pot-size filter done - optional
`potSize` param on `bestAchievableDish` skips recipes whose `nrOfIngredients`
exceeds it, wired to a "Pot size (optional)" input in TeamView. Recipe-level
value: gameData already had `recipe.valueMax` (the maxed-level figure) - now
exposed as `fullValueAtMaxLevel` on each ranked entry for context. Did NOT
switch ranking to use it or add a level input, because this app has no
per-recipe level tracking anywhere - guessing "assume level N" for every
recipe would be exactly the kind of unsourced magnitude this project's rules
reject; a real fix needs a recipe-level UI feature, not a formula tweak.
Sunday extra-tasty bonus is untouched - no day-of-week context exists in the
app yet either.

### I. [DESIGN NOTE — OK] Greedy is myopic but acceptable; add a swap pass
Greedy-marginal can miss combos (especially once F exists, e.g. 3 Electric mons
are individually mediocre but jointly unlock Helper Boost). Full search C(N,5)
is too big for a 60+ roster in-browser, but greedy + local improvement
(try swapping each team member against each bench mon, keep improvements,
repeat to fixpoint) evaluates the TEAM-level score and is fast (~5×N evals per
round). This also gives F a place to live: score teams, not just individuals.

### Validated as correct (no action)
- Ingredient Finder M/S +36%/+18% additive — matches Neroli's Lab.
- Expert freq mults (main 1/0.9, none 1/1.15) — matches "10% faster / 15% slower".
- Expert main favorite +skill level, weekly ×2 with no bonus category on regular
  Greengrass (user-observed, consistent with 2× favorite rule).
- Subskill slot gating by level, ingredient slot gating (30/60), known-roll
  narrowing.
- Marginal demand + coverage logic (regression-tested).
- Dream Shard skills as neutral for dish goal.

## 3. Plan (proposed order)

**Phase 1 — correctness of existing axes (small diffs, big trust gain) — DONE 2026-07-17**
1. ~~Resolve A~~: nature speed double-count removed from all rate math. G
   (nature speed constants) became moot - nature is no longer in rate math.
2. ~~E~~: fixed-island berry match now doubles like any other favorite.

**Phase 2 — real-unit axes — DONE 2026-07-17**
3. ~~C~~: berry strength/hr in real units. Turned out `berry.value` was
   already in gameData - no new table needed, just the level-scaling formula
   and specialty/Berry Finding S berries-per-drop logic.
4. ~~D~~: skill trigger model. Turned out `skillPercent` was already in
   gameData per species - no new data needed, just the activation-rate math
   and Skill Trigger S/M constants.
5. B: two-state energy model — estimate fraction of day at ≥80 energy from
   sleep score assumption + team sustain skills; scale helps/hr by blended
   energy factor instead of flat warning. **Not started.**

**Phase 3 — team-level intelligence (the "legendary strategies" ask) — PARTIALLY DONE 2026-07-17**
6. ~~F (Helper Boost only)~~: `evaluateTeamSet`/`helperBoostAxisBonus` score
   whole 5-member sets including the Helper Boost bonus (Serebii table,
   evenly distributed across the team, folded into each member's own axis
   scale). Helping Bonus/Bad Dreams/Lunar Blessing are tips, not scored (see
   F's phase 3 note above - blocked on the energy model, not skipped).
7. ~~I~~: implemented as a bounded (2-pass) swap-improvement loop after the
   greedy seed, guarded to skip entirely when the roster has no Helper Boost
   carrier (keeps `bestAchievableDish` fast for the common case).
8. ~~Strategy tips panel~~: `result.tips` (Helper Boost quantified w/ next-tier
   hint, Bad Dreams drain count, Lunar Blessing synergy note, Helping Bonus
   holder count), rendered in TeamView. **Not yet added**: nap-timing /
   Sunday extra-tasty tips (no sleep-schedule or day-of-week context in this
   app yet - would need new inputs, not just formula work).

**Phase 4 — polish — DONE 2026-07-17**
9. ~~H~~: pot-size filter shipped (`potSize` param + TeamView input).
   Recipe-level multiplier NOT done as ranking input - no per-recipe level UI
   exists in this app, and guessing a level would violate the sourcing rule;
   `fullValueAtMaxLevel` is exposed as context instead. Sunday extra-tasty
   also untouched (no day-of-week context in the app).
10. ~~Roadmap/user-guide updates + regression tests per phase~~: done
    throughout - see the 2026-07-17 entries in docs/ROADMAP.md's decision
    log. 31 formula tests pass across all four phases.

## Status: audit closed except B
Phases 1-4 are done. The one item from this audit still fully open is
**B (energy modeling)** - everything else (nature double-count, favorite
berries, real-unit berry/skill axes, Helper Boost synergy, pot-size
filtering) either shipped quantitatively or was deliberately deferred to a
new feature (recipe-level tracking) or to B itself (Bad Dreams/Lunar
Blessing/Helping Bonus quantification). B would also make the existing
"no sustain skill" warning precise instead of qualitative.

## Sources
- RaenonX helping frequency formula: https://pks.raenonx.cc/en/docs/view/technical/helping-frequency
- Neroli's Lab source (energy factors, sim model): https://github.com/nerolis-lab/nerolis-lab
- Serebii Helper Boost table: https://www.serebii.net/pokemonsleep/mainskills/helperboost.shtml
- Serebii Lunar Blessing: https://www.serebii.net/pokemonsleep/mainskills/lunarblessingenergyforeveryones.shtml
- Game8 Bad Dreams: https://game8.co/games/Pokemon-Sleep/archives/519348
- Expert Mode bonuses: https://www.pokemonsleep.net/en/news/323932383138363132393037393333363937/
- Favorite berry 2× / island behavior: https://game8.co/games/Pokemon-Sleep/archives/418668 , https://pokemongohub.net/post/sleep/pokemon-sleep-the-islands-and-snorlax/
