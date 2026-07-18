# Team Builder Audit — 2026-07-17

Scope: `buildTeam` / `bestAchievableDish` and every axis feeding them (formulas.js),
audited against community-established mechanics (RaenonX wiki, Neroli's Lab source
code, Serebii, Game8). Goal: is the recommended 5-mon team actually the best
possible combination, and in what order are berries / skills / ingredients
considered?

## 1. How the builder decides today (actual order of consideration)

There is **no sequential order** (berries-then-skills-then-ingredients). Every
candidate gets one weighted sum across five axes, and 5 picks are made greedily:

| Axis | Raw range | Weight | Effective priority |
|---|---|---|---|
| dish (needed ingredients/hr, marginal vs remaining demand) | ~0–2.5 | 12 | 1st — dominates (~0–30 pts) |
| skills (curve × function class × stack decay) | ~0–10 | 0.8 | 2nd (~0–8 pts) |
| berry (island/expert synergy points) | ~0–16 | 0.5 | 3rd (~0–8 pts) |
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

### D. [MODEL GAP — medium] Skill axis ignores trigger rate and absolute value
`cookingSkillScore` = growth-curve position × nature.skill × function weight.
Missing: skill trigger chance per help (species-dependent, ~2–7%), Skill Trigger
S/M subskills (+18%/+36%), and helps/hr (a faster mon procs more). So a Skills
specialist with Skill Trigger M is scored identically to the same skill on a
slow mon with no trigger subskills. **Action: skillValue ≈ helps/hr ×
triggerChance × (1 + trigger subskills) × nature.skill × functionWeight ×
curve.** Species trigger % needs adding to gameData (available on RaenonX
per-species pages / Neroli's Lab data).

### E. [DATA GAP] Favorite berries exist on EVERY island, not just Greengrass
Confirmed: favorite berries give **2× strength on all islands**; fixed islands'
favorites are effectively their fixed berry list (that's why they look "set"),
Greengrass randomizes weekly, Expert adds main/sub frequency effects on top.
Current model: fixed-island berry match awards flat points with no doubling.
Once C lands (real units), island berry match should mean "×2 strength", making
fixed islands and Greengrass weeklyBerries consistent — one code path,
`favoriteBerries` = island list (fixed) or weekly picks (Greengrass) or
main/sub draw (Expert).

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

**Phase 1 — correctness of existing axes (small diffs, big trust gain)**
1. Resolve A: confirm what in-game frequency includes; remove double-counted
   nature speed from all rate math; fix G in passing. Update tests that froze
   the old numbers.
2. E: unify favorite-berry handling across all islands (fixed list = favorites).

**Phase 2 — real-unit axes**
3. C: berry strength/hr in real units (needs per-species berry value + level
   scaling + Berry Finding S detection). Add `berryValue` table to gameData.
4. D: skill trigger model (needs per-species skill trigger % in gameData;
   Skill Trigger S/M subskill constants).
5. B: two-state energy model — estimate fraction of day at ≥80 energy from
   sleep score assumption + team sustain skills; scale helps/hr by blended
   energy factor instead of flat warning.

**Phase 3 — team-level intelligence (the "legendary strategies" ask)**
6. F: team-level score = sum of member scores + team bonuses (Helper Boost type
   count via Serebii table, Helping Bonus −5%/holder, Bad Dreams drain as
   negative, Lunar Blessing berry scaling).
7. I: greedy seed + swap-improvement loop maximizing the TEAM score.
8. Strategy tips panel: generated advice alongside the team ("3 Electric species
   → Helper Boost fires at tier 3; add a 4th for +1 help", "Bad Dreams team has
   no Dark cushions — expect energy drain", "no sustain: nap before 3pm cook",
   "Sunday: hold ingredients for extra-tasty pot").

**Phase 4 — polish**
9. H: pot-size filter + recipe-level multiplier in bestAchievableDish.
10. Roadmap/user-guide updates + regression tests per phase (freeze new numbers).

## Sources
- RaenonX helping frequency formula: https://pks.raenonx.cc/en/docs/view/technical/helping-frequency
- Neroli's Lab source (energy factors, sim model): https://github.com/nerolis-lab/nerolis-lab
- Serebii Helper Boost table: https://www.serebii.net/pokemonsleep/mainskills/helperboost.shtml
- Serebii Lunar Blessing: https://www.serebii.net/pokemonsleep/mainskills/lunarblessingenergyforeveryones.shtml
- Game8 Bad Dreams: https://game8.co/games/Pokemon-Sleep/archives/519348
- Expert Mode bonuses: https://www.pokemonsleep.net/en/news/323932383138363132393037393333363937/
- Favorite berry 2× / island behavior: https://game8.co/games/Pokemon-Sleep/archives/418668 , https://pokemongohub.net/post/sleep/pokemon-sleep-the-islands-and-snorlax/
