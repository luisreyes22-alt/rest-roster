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
  const magnet = { mainSkill: "Ingredient Magnet S", mainSkillLevel: 7, nature: "Hardy" };
  const strength = { mainSkill: "Charge Strength M", mainSkillLevel: 7, nature: "Hardy" };
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
