#!/usr/bin/env node
// Generates test-roster.json (gitignored): 25 varied, fully valid pokemon
// for exercising the app - mixed specialties, natures that buff/nerf the
// score, levels straddling the 30/60 ingredient unlocks and subskill slots,
// a couple of shinies, and some with known ingredient rolls.
//
//   node scripts/make-test-roster.cjs

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const game = JSON.parse(fs.readFileSync(path.join(ROOT, "gameData.json"), "utf-8"));

const picks = [
  // [species, nickname, level, nature, shiny, ing30?, ing60?]
  ["Blastoise",  "Testudo",    62, "Modest",  false, true,  true ],
  ["Charizard",  "Flamita",    58, "Adamant", false, true,  false],
  ["Venusaur",   "Plantón",    45, "Timid",   false, true,  false],
  ["Pikachu",    "Chispa",     22, "Jolly",   true,  false, false],
  ["Raichu",     "Trueno",     41, "Sassy",   false, true,  false],
  ["Ampharos",   "Faro",       60, "Quirky",  false, true,  true ],
  ["Gardevoir",  "Bailarina",  53, "Calm",    false, true,  false],
  ["Aggron",     "Tanque",     47, "Impish",  false, false, false],
  ["Wigglytuff", "Globo",      38, "Gentle",  false, true,  false],
  ["Clefable",   "Lunita",     35, "Bold",    false, false, false],
  ["Quagsire",   "Lodo",       31, "Relaxed", false, true,  false],
  ["Dragonite",  "Dragón",     65, "Brave",   true,  true,  true ],
  ["Espeon",     "Aurora",     50, "Mild",    false, false, false],
  ["Umbreon",    "Sombra",     50, "Careful", false, false, false],
  ["Sylveon",    "Lazo",       44, "Naive",   false, true,  false],
  ["Tyranitar",  "Roca",       61, "Naughty", false, true,  true ],
  ["Gengar",     "Susto",      52, "Hasty",   false, true,  false],
  ["Blissey",    "Enfermera",  57, "Docile",  false, true,  false],
  ["Heracross",  "Cuerno",     49, "Rash",    false, true,  false],
  ["Golem",      "Piedrota",   29, "Hardy",   false, false, false],
  ["Delibird",   "Regalo",     18, "Lonely",  false, false, false],
  ["Xatu",       "Tótem",      42, "Serious", false, true,  false],
  ["Ninetales",  "Nueve",      55, "Quiet",   false, true,  false],
  ["Slowking",   "Rey Lento",  36, "Lax",     false, true,  false],
  ["Mimikyu",    "Disfraz",    27, "Bashful", true,  false, false],
];

const SUBS_BY_TIER = {};
for (const [name, s] of Object.entries(game.subskills)) (SUBS_BY_TIER[s.tier] = SUBS_BY_TIER[s.tier] || []).push(name);
const subPool = ["S", "A", "B", "C", "D"].flatMap(t => SUBS_BY_TIER[t] || []);

const roster = picks.map(([species, name, level, nature, isShiny, hasIng30, hasIng60], i) => {
  const sp = game.species[species];
  if (!sp) throw new Error("Unknown species: " + species);
  const freq = sp.baseFrequency || 3600;

  // 5 distinct subskills per pokemon, rotating through the pool
  const subs = [0, 1, 2, 3, 4].map(k => subPool[(i * 5 + k * 3) % subPool.length]);
  const dedup = [...new Set(subs)];
  while (dedup.length < 5) dedup.push(subPool.find(s => !dedup.includes(s)));
  const subskills = {};
  [10, 25, 50, 70, 80].forEach((slot, k) => {
    subskills[slot] = { name: dedup[k], locked: level < slot };
  });

  const ingredients = {};
  if (hasIng30 && level >= 30 && sp.ingredient30.length) {
    ingredients["30"] = sp.ingredient30[i % sp.ingredient30.length].ingredient;
  }
  if (hasIng60 && level >= 60 && sp.ingredient60.length) {
    ingredients["60"] = sp.ingredient60[i % sp.ingredient60.length].ingredient;
  }

  return {
    id: `test25_${i}_${species.replace(/[^a-zA-Z0-9]/g, "")}`,
    name, species,
    specialty: sp.specialty,
    berry: sp.berry,
    mainSkill: sp.mainSkill,
    mainSkillLevel: 1 + (i % 6),
    level,
    rp: 800 + i * 173,
    frequency: `${Math.floor(freq / 60)} mins ${freq % 60} secs`,
    carryLimit: sp.carryLimitBase,
    nature, isShiny, subskills, ingredients
  };
});

// sanity: everything must pass the app's import validation
for (const p of roster) {
  if (!game.species[p.species]) throw new Error("bad species " + p.species);
  if (!game.mainSkills[p.mainSkill]) throw new Error("bad skill " + p.mainSkill);
  for (const e of Object.values(p.subskills)) if (!game.subskills[e.name]) throw new Error("bad subskill " + e.name);
  for (const ing of Object.values(p.ingredients)) if (!game.ingredients.some(x => x.name === ing)) throw new Error("bad ingredient " + ing);
}

fs.writeFileSync(path.join(ROOT, "test-roster.json"), JSON.stringify(roster, null, 2));
const spread = roster.reduce((a, p) => { a[p.specialty] = (a[p.specialty] || 0) + 1; return a; }, {});
console.log(`Wrote ${roster.length} pokemon to test-roster.json`);
console.log(`Specialty spread: ${JSON.stringify(spread)}`);
console.log(`Shinies: ${roster.filter(p => p.isShiny).length} · with ingredient rolls: ${roster.filter(p => Object.keys(p.ingredients).length).length}`);
