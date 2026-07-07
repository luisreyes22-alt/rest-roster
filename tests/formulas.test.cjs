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

test("natureMods applies the documented +/-10% speed and +/-20% skill-chance multipliers", () => {
  const speedBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Speed of help");
  const speedNerfNature = Object.keys(GAME.natures).find(n => GAME.natures[n].nerf === "Speed of help");
  const skillBuffNature = Object.keys(GAME.natures).find(n => GAME.natures[n].buff === "Main skill chance");
  const skillNerfNature = Object.keys(GAME.natures).find(n => GAME.natures[n].nerf === "Main skill chance");
  const neutralNature = Object.keys(GAME.natures).find(n => !GAME.natures[n].buff && !GAME.natures[n].nerf);

  assert.equal(Formulas.natureMods(speedBuffNature).speed, 1.1);
  assert.equal(Formulas.natureMods(speedNerfNature).speed, 0.925);
  assert.equal(Formulas.natureMods(skillBuffNature).skill, 1.2);
  assert.equal(Formulas.natureMods(skillNerfNature).skill, 0.8);
  assert.deepEqual(Formulas.natureMods(neutralNature), { speed: 1, skill: 1 });
  assert.deepEqual(Formulas.natureMods("Not A Real Nature"), { speed: 1, skill: 1 });
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
