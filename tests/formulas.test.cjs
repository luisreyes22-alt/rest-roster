// Run with: node --test tests/
// No framework install needed - node's built-in test runner + assert.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const Formulas = require("../formulas.cjs");
const GAME = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "gameData.json"), "utf-8"));
Formulas.setGame(GAME);

function pickSpecies(pred) {
  const name = Object.keys(GAME.species).find(s => pred(GAME.species[s]));
  assert.ok(name, "expected to find a matching species in gameData.json");
  return name;
}

test("freqToSecs parses '<m> mins <s> secs' and passes numbers through", () => {
  assert.equal(Formulas.freqToSecs("38 mins 2 secs"), 38*60+2);
  assert.equal(Formulas.freqToSecs("45 mins 0 secs"), 45*60);
  assert.equal(Formulas.freqToSecs(1200), 1200);
  assert.equal(Formulas.freqToSecs("garbage"), 9999);
});

test("isSubskillLocked is purely level-driven, ignoring any stored locked flag", () => {
  assert.equal(Formulas.isSubskillLocked(9, 10), true);
  assert.equal(Formulas.isSubskillLocked(10, 10), false);
  assert.equal(Formulas.isSubskillLocked(49, 50), true);
  assert.equal(Formulas.isSubskillLocked(50, 50), false);
});

test("scoreSubskills ignores locked slots and weights unlocked ones by tier x slot weight", () => {
  const subskillName = Object.keys(GAME.subskills)[0];
  const tier = GAME.subskills[subskillName].tier;
  const expectedPerSlot = Formulas.TIER_SCORES[tier] * Formulas.SLOT_WEIGHTS[10];

  // Level 5: slot 10 is locked, contributes nothing.
  const lockedScore = Formulas.scoreSubskills({ 10: { name: subskillName } }, 5);
  assert.equal(lockedScore, 0);

  // Level 10: slot 10 unlocks.
  const unlockedScore = Formulas.scoreSubskills({ 10: { name: subskillName } }, 10);
  assert.equal(unlockedScore, Math.round(expectedPerSlot * 10) / 10);
});

test("natureMods applies the documented speed/skill/ingredient multipliers", () => {
  const speedBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Speed of help");
  const speedNerfNature = Object.keys(GAME.natures).find(n => GAME.natures[n].nerf === "Speed of help");
  const skillBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Main skill chance");
  const skillNerfNature = Object.keys(GAME.natures).find(n => GAME.natures[n].nerf === "Main skill chance");
  const ingBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Ingredient finding");
  const ingNerfNature = Object.keys(GAME.natures).find(n => GAME.natures[n].nerf === "Ingredient finding");
  const neutralNature = Object.keys(GAME.natures).find(n => !GAME.natures[n].buff && !GAME.natures[n].nerf);

  assert.equal(Formulas.natureMods(speedBuffNature).speed, 1.1);
  assert.equal(Formulas.natureMods(speedNerfNature).speed, 0.925);
  assert.equal(Formulas.natureMods(skillBuffNature).skill, 1.2);
  assert.equal(Formulas.natureMods(skillNerfNature).skill, 0.8);
  assert.equal(Formulas.natureMods(ingBuffNature).ing, 1.2);
  assert.equal(Formulas.natureMods(ingNerfNature).ing, 0.8);
  assert.deepEqual(Formulas.natureMods(neutralNature), { speed: 1, skill: 1, ing: 1 });
  assert.deepEqual(Formulas.natureMods("Not A Real Nature"), { speed: 1, skill: 1, ing: 1 });
});

test("totalScore is deterministic and reproducible for a fixed pokemon (freezes rounding behavior)", () => {
  const species = pickSpecies(() => true);
  const sub10 = Object.keys(GAME.subskills)[0];
  const sub25 = Object.keys(GAME.subskills)[1];
  const pokemon = {
    species, level: 30, nature: "Hardy",
    frequency: "40 mins 0 secs",
    mainSkill: Object.keys(GAME.mainSkills)[0], mainSkillLevel: 1,
    subskills: { 10: { name: sub10 }, 25: { name: sub25 } },
  };
  const a = Formulas.totalScore(pokemon);
  const b = Formulas.totalScore(pokemon);
  assert.equal(a, b, "same input must always produce the same score");
  assert.equal(typeof a, "number");
  assert.ok(Number.isFinite(a));
});

test("individualIngredientPool always includes the base ingredient, and gates slot 2/3 by level", () => {
  const species = pickSpecies(sp => sp.ingredient30?.length && sp.ingredient60?.length);
  const sp = GAME.species[species];
  const baseIngredient = sp.ingredient0[0].ingredient;

  const lowLevel = Formulas.individualIngredientPool({ species, level: 10, ingredients: {} });
  assert.ok(lowLevel.has(baseIngredient));
  assert.equal(lowLevel.size, new Set(sp.ingredient0.map(i=>i.ingredient)).size);

  const highLevel = Formulas.individualIngredientPool({ species, level: 60, ingredients: {} });
  assert.ok(highLevel.size >= lowLevel.size, "higher level should never narrow the pool when the roll is unknown");

  // A known roll at level 30 restricts slot 2 to just that ingredient instead of the whole pool.
  const knownRoll = sp.ingredient30[0].ingredient;
  const knownPool = Formulas.individualIngredientPool({ species, level: 30, ingredients: { "30": knownRoll } });
  assert.ok(knownPool.has(knownRoll));
});

test("buildTeam returns at most 5 members, all drawn from the roster, with unique ids", () => {
  const islandName = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert);
  const species = Object.keys(GAME.species);
  const roster = species.slice(0, 8).map((s, i) => ({
    id: `p${i}`, species: s, name: s,
    specialty: GAME.species[s].specialty, berry: GAME.species[s].berry,
    level: 40, nature: "Hardy", frequency: "40 mins 0 secs",
    mainSkill: GAME.species[s].mainSkill, mainSkillLevel: 1,
    subskills: {}, ingredients: {},
  }));

  const result = Formulas.buildTeam(roster, islandName, null, null);
  assert.ok(result.team.length <= 5);
  assert.ok(result.team.length > 0);
  const ids = result.team.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, "no pokemon should be picked twice");
  ids.forEach(id => assert.ok(roster.some(p => p.id === id)));
});

// ── Team Builder v2 ───────────────────────────────────────────────────────────

// Helpers to build synthetic-but-valid roster entries from real gameData species.
function mon(overrides) {
  const species = overrides.species;
  const sp = GAME.species[species];
  return {
    id: overrides.id, name: overrides.id, species,
    specialty: sp.specialty, berry: sp.berry,
    level: 60, nature: "Hardy", frequency: "40 mins 0 secs",
    mainSkill: sp.mainSkill, mainSkillLevel: 1,
    subskills: {}, ingredients: {},
    ...overrides,
  };
}
const nonExpertIsland = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert && GAME.islands[i].berries.includes("all"))
  || Object.keys(GAME.islands).find(i => !GAME.islands[i].expert);

test("cooking-function weighting inverts the raw curve ranking: Ingredient Magnet beats Charge Strength at max level", () => {
  // cookingSkillScore now factors in real activations/hour (species skillPercent x
  // nature x trigger subskills), so both mons need real species data - the same
  // species for both, so only the assigned skill/level differs.
  const species = pickSpecies(() => true);
  const magnet = mon({ id: "magnet", species, mainSkill: "Ingredient Magnet S", mainSkillLevel: 7, nature: "Hardy" });
  const strength = mon({ id: "strength", species, mainSkill: "Charge Strength M", mainSkillLevel: 7, nature: "Hardy" });
  assert.ok(Formulas.scoreMainSkill(strength) > Formulas.scoreMainSkill(magnet),
    "sanity: raw curve score still favors Charge Strength (steeper curve)");
  assert.ok(Formulas.cookingSkillScore(magnet) > Formulas.cookingSkillScore(strength),
    "cooking-weighted score must favor the cooking skill");
});

test("every main skill in gameData has an explicit function classification", () => {
  const unclassified = Object.keys(GAME.mainSkills).filter(s => !(s in Formulas.SKILL_FUNCTIONS));
  assert.deepEqual(unclassified, [], "no skill may silently fall through to 'neutral'");
});

test("ingredientRate respects known rolls: a mon rolled onto a needed ingredient outproduces one rolled off it", () => {
  // Find a species whose Lv.30 slot has 2+ distinct ingredient options.
  const species = Object.keys(GAME.species).find(s => {
    const opts = new Set(GAME.species[s].ingredient30.map(i => i.ingredient));
    return opts.size >= 2;
  });
  const sp = GAME.species[species];
  const [ingA, ingB] = [...new Set(GAME.species[species].ingredient30.map(i => i.ingredient))];
  const needed = new Set([ingA]);
  const base = new Set(sp.ingredient0.map(i => i.ingredient));

  const onRoll  = mon({ id: "on",  species, level: 30, ingredients: { "30": ingA } });
  const offRoll = mon({ id: "off", species, level: 30, ingredients: { "30": ingB } });
  assert.ok(Formulas.ingredientRate(onRoll, needed) > Formulas.ingredientRate(offRoll, needed));
  // If the base slot also can't produce the needed ingredient, the off-roll mon's rate is 0.
  if (!base.has(ingA)) assert.equal(Formulas.ingredientRate(offRoll, needed), 0);
});

test("monopoly regression: a pure-strength mon with zero dish contribution never beats dish contributors under dish-first weights", () => {
  // A recipe with at least 2 distinct ingredients keeps the dish axis busy for 5 picks.
  const recipe = GAME.recipes.find(r => r.ingredients.length >= 3);
  const neededIngredients = recipe.ingredients.map(i => i.ingredient);

  // 6 REAL producers: decent ingredient% species whose base ingredient is needed,
  // with known Lv.30 rolls onto a needed ingredient where the species offers one.
  // Weak trickle producers wouldn't make a fair monopoly test - a maxed all-rounder
  // legitimately outranks near-zero contributors once marginal dish value decays.
  const producerSpecies = Object.keys(GAME.species).filter(s =>
    (GAME.species[s].ingredientPercent || 0) >= 15 &&
    GAME.species[s].ingredient0.some(i => neededIngredients.includes(i.ingredient))).slice(0, 6);
  assert.ok(producerSpecies.length >= 6, "gameData should offer 6+ strong base producers for a 3-ingredient recipe");
  const knownRollFor = s => GAME.species[s].ingredient30.find(i => neededIngredients.includes(i.ingredient))?.ingredient;

  // The "Sango archetype": maxed Charge Strength M, great subskills, produces NOTHING
  // the dish needs, and isn't a Berries specialist (so no berry-axis credit either -
  // mirrors the real Sango, a Skills-specialty Ampharos).
  const strengthSpecies = Object.keys(GAME.species).find(s =>
    GAME.species[s].mainSkill === "Charge Strength M" &&
    GAME.species[s].specialty !== "Berries" &&
    !GAME.species[s].ingredient0.some(i => neededIngredients.includes(i.ingredient)) &&
    !GAME.species[s].ingredient30.some(i => neededIngredients.includes(i.ingredient)) &&
    !GAME.species[s].ingredient60.some(i => neededIngredients.includes(i.ingredient)));

  if (!strengthSpecies) return; // recipe too broad for this gameData - nothing to regress against

  // Producers are realistic (an ingredient subskill, known useful roll), not bare
  // stat-sticks - the monopoly claim is about REAL contributors losing seats.
  const roster = [
    ...producerSpecies.map((s, i) => mon({ id: `prod${i}`, species: s, frequency: "30 mins 0 secs",
      subskills: { 10: { name: "Ingredient Finder M" } },
      ingredients: knownRollFor(s) ? { "30": knownRollFor(s) } : {} })),
    mon({ id: "sango-like", species: strengthSpecies, mainSkill: "Charge Strength M", mainSkillLevel: 7,
      frequency: "30 mins 0 secs",
      subskills: { 10: { name: "Skill Trigger M" }, 25: { name: "Helping Speed M" }, 50: { name: "Ingredient Finder M" } } }),
  ];

  const result = Formulas.buildTeam(roster, nonExpertIsland, recipe.name, null);
  // The monopoly break, precisely: the strength mon must not crowd out COVERAGE.
  // It may still earn a late seat over a REDUNDANT producer (that's marginal decay
  // working, not the bug) - but it can never lead the team, and dish contributors
  // must hold the majority.
  assert.equal(result.missingIngredients.length, 0,
    "every recipe ingredient stays covered - the strength mon may never displace unique coverage");
  const topThree = result.team.slice(0, 3).map(p => p.id);
  assert.ok(!topThree.includes("sango-like"),
    "the strength mon must not out-rank real dish contributors for the leading seats");
  const contributors = result.team.filter(p => p.id !== "sango-like").length;
  assert.ok(contributors >= 4, "dish contributors must hold at least 4 of 5 seats");
});

test("coverage beats redundancy: the only producer of a second needed ingredient makes the team over a redundant duplicate", () => {
  // Recipe with 2+ ingredients where distinct base-producer species exist for two of them.
  let recipe, ingX, ingY, speciesX, speciesY;
  outer:
  for (const r of GAME.recipes.filter(r => r.ingredients.length >= 2)) {
    const names = r.ingredients.map(i => i.ingredient);
    for (const a of names) for (const b of names) {
      if (a === b) continue;
      const sx = Object.keys(GAME.species).find(s => GAME.species[s].ingredient0.some(i => i.ingredient === a));
      const sy = Object.keys(GAME.species).find(s => GAME.species[s].ingredient0.some(i => i.ingredient === b) &&
        !GAME.species[s].ingredient0.some(i => i.ingredient === a));
      if (sx && sy) { recipe = r; ingX = a; ingY = b; speciesX = sx; speciesY = sy; break outer; }
    }
  }
  assert.ok(recipe, "expected a recipe + species pair in gameData");

  // 5 identical X-producers + 1 Y-producer; only 5 seats. Marginal decay must seat the Y-producer.
  const roster = [
    ...[0,1,2,3,4].map(i => mon({ id: `x${i}`, species: speciesX, level: 10 })),
    mon({ id: "y", species: speciesY, level: 10 }),
  ];
  const result = Formulas.buildTeam(roster, nonExpertIsland, recipe.name, null);
  assert.ok(result.team.some(p => p.id === "y"),
    `the sole ${ingY} producer must beat the 5th redundant ${ingX} producer`);
});

test("bestAchievableDish returns every recipe ranked by achievable value, descending", () => {
  const roster = Object.keys(GAME.species).slice(0, 10).map((s, i) => mon({ id: `r${i}`, species: s }));
  const ranked = Formulas.bestAchievableDish(roster, nonExpertIsland, null);
  assert.equal(ranked.length, GAME.recipes.length);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i-1].achievable >= ranked[i].achievable, "must be sorted descending");
  }
  ranked.forEach(r => {
    assert.ok(r.achievable <= r.fullValue, "achievable can never exceed the recipe's full value");
    assert.ok(r.result.team.length <= 5);
  });
});

test("buildTeam reports coveragePct only when a recipe is selected, always within 0-100", () => {
  const roster = Object.keys(GAME.species).slice(0, 10).map((s, i) => mon({ id: `c${i}`, species: s }));
  const noDish = Formulas.buildTeam(roster, nonExpertIsland, null, null);
  assert.equal(noDish.coveragePct, null);
  const withDish = Formulas.buildTeam(roster, nonExpertIsland, GAME.recipes[0].name, null);
  assert.ok(withDish.coveragePct >= 0 && withDish.coveragePct <= 100);
});

// ── Nature speed double-count regression ────────────────────────────────────────
// Regression for a reported bug: p.frequency is read straight off the Pokemon's
// in-game info screen, which the game already computes with nature's speed effect
// applied (confirmed: a neutral nature like Serious shows unchanged speed only
// because its equal buff/nerf cancel - that's meaningless unless nature is already
// baked into what's displayed). Multiplying natureMods().speed into rate math on
// top of that double-counted the bonus. Only skill-chance/ingredient-finding
// natures are separate stats not reflected in the displayed frequency.

test("helps/hour is read directly from frequency and does not reapply nature's speed modifier", () => {
  const species = pickSpecies(() => true);
  // Must nerf a stat this score model doesn't touch (Energy recovery), not
  // Ingredient finding/Main skill chance - otherwise that paired nerf legitimately
  // changes ingredientRate and masks whether the speed double-count is fixed.
  const speedBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Speed of help" && GAME.natures[n].nerf === "Energy recovery");
  const neutralNature = Object.keys(GAME.natures).find(n => !GAME.natures[n].buff && !GAME.natures[n].nerf);
  assert.ok(speedBuffNature, "expected a Speed-of-help nature that nerfs Energy recovery (untouched by this score model)");

  const fastNature = mon({ id: "fast", species, nature: speedBuffNature, frequency: "40 mins 0 secs" });
  const neutralNatureMon = mon({ id: "neutral", species, nature: neutralNature, frequency: "40 mins 0 secs" });

  // Same stored frequency (as read from the in-game info screen) must yield the
  // same helps/hour regardless of nature - nature's speed effect is already
  // reflected in that stored value, so it must not be applied a second time.
  const rateFast = Formulas.ingredientRate(fastNature);
  const rateNeutral = Formulas.ingredientRate(neutralNatureMon);
  assert.equal(rateFast, rateNeutral,
    "identical frequency must produce identical throughput regardless of nature - nature is already baked into the stored frequency");
});

// ── Real-unit berry/skill axes (Team Builder audit phase 2) ────────────────────
// The berry and skill axes used to be arbitrary points (8/3, curve position only).
// Both are now real per-hour units sourced from Neroli's Lab
// (common/src/utils/rp-utils/rp.ts berryFactor/skillFactor, common/src/utils/
// stat-utils/stat-utils.ts calculateNrOfBerriesPerDrop/calculateSkillPercentage) so
// a maxed favorite-berry specialist or a fast high-skillPercent mon actually scores
// higher than a token match, instead of every match in a tier scoring identically.

test("berryValueAtLevel matches the documented formula: max of linear and compounding growth", () => {
  assert.equal(Formulas.berryValueAtLevel(30, 1), 30, "level 1 has no growth yet");
  const lvl60Linear = 30 + 60 - 1;
  const lvl60Compound = Math.round(Math.pow(1.025, 59) * 30);
  assert.equal(Formulas.berryValueAtLevel(30, 60), Math.max(lvl60Linear, lvl60Compound));
  assert.ok(Formulas.berryValueAtLevel(30, 60) > Formulas.berryValueAtLevel(30, 10),
    "berry value must grow with the producing pokemon's level");
});

test("berriesPerDrop: Berries/All specialty finds 2, others find 1, Berry Finding S adds 1 more", () => {
  assert.equal(Formulas.berriesPerDrop({ specialty: "Berries", level: 60, subskills: {} }), 2);
  assert.equal(Formulas.berriesPerDrop({ specialty: "All", level: 60, subskills: {} }), 2);
  assert.equal(Formulas.berriesPerDrop({ specialty: "Ingredients", level: 60, subskills: {} }), 1);
  assert.equal(Formulas.berriesPerDrop({ specialty: "Skills", level: 60, subskills: {} }), 1);
  assert.equal(Formulas.berriesPerDrop({ specialty: "Ingredients", level: 60, subskills: { 10: { name: "Berry Finding S" } } }), 2);
  // Locked slot (below its level) must not grant the bonus yet.
  assert.equal(Formulas.berriesPerDrop({ specialty: "Ingredients", level: 5, subskills: { 10: { name: "Berry Finding S" } } }), 1);
});

test("berryRate: a Berries specialist outproduces an otherwise-identical non-specialist on the same species/level", () => {
  const species = pickSpecies(() => true);
  const specialist = mon({ id: "spec", species, specialty: "Berries", frequency: "30 mins 0 secs" });
  const nonSpecialist = mon({ id: "non", species, specialty: "Ingredients", frequency: "30 mins 0 secs" });
  assert.ok(Formulas.berryRate(specialist) > Formulas.berryRate(nonSpecialist),
    "Berries specialty finds 2 berries/help vs 1, so its berry strength/hour must be higher");
});

test("skillActivationRate: Skill Trigger M subskill and a skill-chance nature both raise activations/hour", () => {
  const species = pickSpecies(() => true);
  const base = mon({ id: "base", species, nature: "Hardy", subskills: {} });
  const withTrigger = mon({ id: "trig", species, nature: "Hardy", subskills: { 10: { name: "Skill Trigger M" } } });
  const skillBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Main skill chance");
  const withNature = mon({ id: "nat", species, nature: skillBuffNature, subskills: {} });

  assert.ok(Formulas.skillActivationRate(withTrigger) > Formulas.skillActivationRate(base),
    "Skill Trigger M must raise expected activations/hour");
  assert.ok(Formulas.skillActivationRate(withNature) > Formulas.skillActivationRate(base),
    "a main-skill-chance nature must raise expected activations/hour");
});

test("buildTeam: fixed-berry islands treat their whole berry list as a standing favorite, not a flat match", () => {
  // A full 5-seat roster of non-matching-berry fillers, then one otherwise-identical
  // challenger carrying a berry the island actually accepts - the challenger's berry
  // axis is real, non-zero units (vs the fillers' 0, since acceptsAll is false), so
  // it must bump a filler out even though every other axis ties.
  const fixedIsland = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert && !GAME.islands[i].weeklyBerries && !GAME.islands[i].berries.includes("all"));
  assert.ok(fixedIsland, "expected at least one fixed-berry-list island in gameData");
  const islandBerry = GAME.islands[fixedIsland].berries[0];
  const species = pickSpecies(() => true);

  const filler = [0, 1, 2, 3, 4].map(i => mon({ id: `filler${i}`, species, berry: "Not A Real Berry", level: 30 }));
  const challenger = mon({ id: "challenger", species, berry: islandBerry, level: 30 });
  const result = Formulas.buildTeam([...filler, challenger], fixedIsland, null, null);
  assert.ok(result.team.some(p => p.id === "challenger"),
    "the fixed-island-berry mon must displace a non-matching filler when every other axis is tied");
});

// ── Team Builder audit phase 3: Helper Boost synergy + strategy tips ───────────
// Raikou/Entei/Suicune's Helper Boost grants the whole team free helps, scaling
// with how many teammates share the carrier's type (Serebii-sourced table). The
// greedy loop alone can't see this (it can't know who gets picked AFTER a given
// candidate), so buildTeam runs a bounded swap-improvement pass afterward that
// can and should change which Pokemon make the team.

test("HELPER_BOOST_TABLE matches the sourced Serebii table at its known reference points", () => {
  assert.equal(Formulas.HELPER_BOOST_TABLE[1][0], 2, "level 1, 1 match");
  assert.equal(Formulas.HELPER_BOOST_TABLE[6][4], 11, "level 6, 5 matches - the documented ceiling");
  assert.equal(Formulas.HELPER_BOOST_TABLE[3][2], 5, "level 3, 3 matches");
});

test("buildTeam's swap pass lets Helper Boost synergy change team membership, holding every candidate's own stats constant", () => {
  // normal1 (Persian, Ingredient Magnet S Lv.1) is identical in both runs - only
  // raikou's own skill differs between them (Helper Boost vs a throwaway neutral
  // skill). If normal1's presence on the team flips between runs, that's the
  // swap phase's Helper Boost bonus at work, not a difference in normal1 itself.
  const island = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert && GAME.islands[i].berries.includes("all"));
  const electric2 = mon({ id: "electric2", species: "Luxray" });
  const normal1 = mon({ id: "normal1", species: "Persian", mainSkill: "Ingredient Magnet S", mainSkillLevel: 1 });
  const filler = [0, 1, 2].map(i => mon({ id: `f${i}`, species: "Bagon", mainSkill: "Charge Strength S", mainSkillLevel: 1 }));

  const raikouWithHelperBoost = mon({ id: "raikou", species: "Raikou", mainSkillLevel: 6 });
  const withHB = Formulas.buildTeam([raikouWithHelperBoost, electric2, normal1, ...filler], island, null, null);

  const raikouWithoutHelperBoost = mon({ id: "raikou", species: "Raikou", mainSkill: "Dream Shard Magnet S", mainSkillLevel: 1 });
  const withoutHB = Formulas.buildTeam([raikouWithoutHelperBoost, electric2, normal1, ...filler], island, null, null);

  assert.ok(withoutHB.team.some(p => p.id === "normal1"),
    "sanity: without Helper Boost active, normal1 earns its seat on its own merits");
  assert.ok(!withHB.team.some(p => p.id === "normal1"),
    "with Helper Boost active, the same normal1 loses its seat to the type-matching electric2");
  assert.ok(withHB.team.some(p => p.id === "electric2"), "the type-matching mon must be the one that displaced it");
});

test("buildTeam surfaces a Helper Boost tip with the sourced match count and helps-per-activation", () => {
  const island = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert && GAME.islands[i].berries.includes("all"));
  const raikou = mon({ id: "raikou", species: "Raikou", mainSkillLevel: 6 });
  const electricFriend = mon({ id: "friend", species: "Luxray" });
  const filler = [0, 1, 2].map(i => mon({ id: `f${i}`, species: "Bagon" }));
  const result = Formulas.buildTeam([raikou, electricFriend, ...filler], island, null, null);
  assert.ok(result.tips.some(t => t.includes("Helper Boost") && t.includes("Electric")),
    "expected a Helper Boost tip naming the matched type");
});

test("buildTeam surfaces qualitative tips for Bad Dreams and Lunar Blessing carriers", () => {
  const island = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert && GAME.islands[i].berries.includes("all"));
  const darkrai = mon({ id: "darkrai", species: "Darkrai", mainSkillLevel: 7 });
  const cresselia = mon({ id: "cresselia", species: "Cresselia", mainSkillLevel: 6 });
  const filler = [0, 1, 2].map(i => mon({ id: `f${i}`, species: "Bagon" }));
  const result = Formulas.buildTeam([darkrai, cresselia, ...filler], island, null, null);
  assert.ok(result.tips.some(t => t.includes("Bad Dreams") && t.includes("drains")),
    "expected a Bad Dreams energy-drain tip");
  assert.ok(result.tips.some(t => t.includes("Lunar Blessing")),
    "expected a Lunar Blessing tip");
});

test("buildTeam surfaces a Helping Bonus tip when a team member carries the unlocked subskill", () => {
  const island = Object.keys(GAME.islands).find(i => !GAME.islands[i].expert && GAME.islands[i].berries.includes("all"));
  const species = pickSpecies(() => true);
  const holder = mon({ id: "holder", species, subskills: { 10: { name: "Helping Bonus" } } });
  const filler = [0, 1, 2, 3].map(i => mon({ id: `f${i}`, species }));
  const result = Formulas.buildTeam([holder, ...filler], island, null, null);
  assert.ok(result.tips.some(t => t.includes("Helping Bonus")), "expected a Helping Bonus tip");
});

test("hasUnlockedSubskill ignores a slot below the pokemon's level, mirroring isSubskillLocked", () => {
  assert.equal(Formulas.hasUnlockedSubskill({ level: 60, subskills: { 10: { name: "Helping Bonus" } } }, "Helping Bonus"), true);
  assert.equal(Formulas.hasUnlockedSubskill({ level: 5, subskills: { 10: { name: "Helping Bonus" } } }, "Helping Bonus"), false);
});

// ── Greengrass Isle regular weekly favorite berries ────────────────────────────
// Regression for the reported bug: on regular Greengrass Isle (not Expert Mode),
// picking no berries meant the team builder had no way to reward the 3 favorite
// berries the player actually rolled that week (each doubles its own berry value,
// no speed change, no random bonus category - that's Expert Mode only).

test("Greengrass Isle is modeled as having weekly favorite berries, distinct from Expert Mode", () => {
  assert.equal(GAME.islands["Greengrass Isle"].weeklyBerries, true);
  assert.equal(GAME.islands["Greengrass Isle"].expert, false);
  assert.equal(GAME.islands["Greengrass Isle (Expert Mode)"].expert, true);
});

test("without a favoriteBerries config, Greengrass Isle scores as a plain accepts-all island", () => {
  const roster = Object.keys(GAME.species).slice(0, 5).map((s, i) => mon({ id: `p${i}`, species: s }));
  const result = Formulas.buildTeam(roster, nonExpertIsland, null, null);
  assert.equal(result.isWeeklyFavorite, false);
  assert.equal(result.favoriteMatches, undefined);
});

test("a mon carrying one of this week's 3 favorite berries displaces an otherwise-identical non-favorite mon", () => {
  const species = Object.keys(GAME.species)[0];
  const config = { favoriteBerries: ["Oran", "Leppa", "Sitrus"] };

  // 5 identical fillers (non-favorite berry) fully occupy the team; a 6th mon,
  // identical in every other axis, carries a favorite berry and should bump one out.
  const filler = [0,1,2,3,4].map(i => mon({ id: `filler${i}`, species, berry: "Persim", specialty: "Berries" }));
  const challenger = mon({ id: "challenger", species, berry: "Oran", specialty: "Berries" });

  const result = Formulas.buildTeam([...filler, challenger], nonExpertIsland, null, config);
  assert.equal(result.isWeeklyFavorite, true);
  assert.equal(result.favoriteMatches, 1);
  assert.ok(result.team.some(p => p.id === "challenger"),
    "the favorite-berry mon must displace a non-favorite filler when every other axis is tied");
  assert.ok(result.team.some(p => p.role === "Berries (favorite)"),
    "the favorite-berry pick should be labeled distinctly from a plain island-berry match");
});
