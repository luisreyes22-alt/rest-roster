#!/usr/bin/env node
// Regenerates omar_roster/omar-roster.json (the Roster > IMPORT file) from the
// raw screenshot-extraction log. Run from anywhere:
//
//   node scripts/build-omar-roster.cjs
//
// Inputs:  omar_roster/_extraction-progress.json (2026-07-08)
//          gameData.json                          (validation + species facts)
// Output:  omar_roster/omar-roster.json (gitignored - personal data)
//
// The entry order in the extraction file is what fixes each pokemon's id
// ("omar_<index>_<Species>"), so never reorder or delete entries in the
// extraction file - correct them in place. Ids are how the app's import
// dedup recognizes already-imported pokemon.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf-8"));

const allEntries = read("omar_roster/_extraction-progress.json").entries;
const game = read("gameData.json");

let bad = 0;

for (const e of allEntries) {
  if (!game.species[e.species]) { console.error(`BAD SPECIES   ${e.nickname}: ${e.species}`); bad++; continue; }
  if (!game.mainSkills[e.mainSkill]) { console.error(`BAD SKILL     ${e.nickname}: ${e.mainSkill}`); bad++; }
  for (const ss of Object.values(e.subskills || {})) {
    if (ss.name && !game.subskills[ss.name]) { console.error(`BAD SUBSKILL  ${e.nickname}: ${ss.name}`); bad++; }
  }
}
if (bad > 0) {
  console.error(`\n${bad} bad reference(s) - fix the extraction file first. Nothing written.`);
  process.exit(1);
}

const roster = allEntries.map((e, i) => {
  const sp = game.species[e.species];
  const subskills = {};
  for (const [slot, ss] of Object.entries(e.subskills || {})) {
    if (ss.name) subskills[slot] = { name: ss.name, locked: !!ss.locked };
  }
  return {
    id: "omar_" + i + "_" + e.species.replace(/[^a-zA-Z0-9]/g, ""),
    name: e.nickname,
    species: e.species,
    specialty: sp.specialty,
    berry: sp.berry,
    mainSkill: e.mainSkill,
    mainSkillLevel: e.mainSkillLevel || 1,
    level: e.level,
    rp: e.rp || 0,
    frequency: e.frequency,
    carryLimit: e.carryLimit || sp.carryLimitBase,
    nature: String(e.nature).includes("unknown") ? "" : e.nature,
    isShiny: !!e.isShiny,
    subskills
  };
});

fs.writeFileSync(path.join(ROOT, "omar_roster/omar-roster.json"), JSON.stringify(roster, null, 2));

const spread = roster.reduce((a, p) => { a[p.specialty] = (a[p.specialty] || 0) + 1; return a; }, {});
console.log(`Wrote ${roster.length} pokemon to omar_roster/omar-roster.json`);
console.log(`Shinies: ${roster.filter(p => p.isShiny).length}`);
console.log(`Specialty spread: ${JSON.stringify(spread)}`);
const noNature = roster.filter(p => !p.nature).map(p => p.name);
if (noNature.length) console.log(`Missing nature (fix in-app): ${noNature.join(", ")}`);
