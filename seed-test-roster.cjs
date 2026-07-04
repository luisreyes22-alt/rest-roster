// Generates a 24-pokemon test roster from real gameData.json for QA of the team builder.
// Run `node seed-test-roster.cjs`, then in the app use Roster > IMPORT and pick test-roster.json.
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'gameData.json'), 'utf-8'));

// Balanced across specialties on purpose, so the team builder has real choices to make:
// 8 Berries, 8 Ingredients, 7 Skills, 1 All (Darkrai is the only "all" specialist in the game).
const NAMES = [
  // Berries
  'Butterfree', 'Raichu', 'Clefable', 'Ninetales', 'Dodrio', 'Marowak', 'Typhlosion', 'Feraligatr',
  // Ingredients
  'Venusaur', 'Blastoise', 'Gengar', 'Kangaskhan', 'Pinsir', 'Dragonite', 'Quagsire', 'Charizard',
  // Skills
  'Golduck', 'Arcanine', 'Slowbro', 'Vaporeon', 'Jolteon', 'Flareon', 'Ampharos',
  // All
  'Darkrai'
];

const NATURES = Object.keys(data.natures);
const SUBSKILLS = Object.keys(data.subskills);

function pick(arr, seed) {
  return arr[seed % arr.length];
}

const roster = NAMES.map((name, idx) => {
  const sp = data.species[name];
  if (!sp) throw new Error(`Missing species in gameData.json: ${name}`);
  const level = 25 + ((idx * 7) % 51); // spread 25-75
  const nature = pick(NATURES, idx * 3 + 1);
  const sub10 = pick(SUBSKILLS, idx);
  const sub25 = pick(SUBSKILLS, idx + 5);
  return {
    id: `test_${idx}_${name}`,
    name,
    species: name,
    specialty: sp.specialty,
    berry: sp.berry,
    mainSkill: sp.mainSkill,
    mainSkillLevel: 1 + (idx % 4),
    level,
    rp: 800 + idx * 60,
    frequency: `${Math.floor(sp.baseFrequency / 60)} mins ${sp.baseFrequency % 60} secs`,
    carryLimit: sp.carryLimitBase,
    nature,
    subskills: {
      10: { name: sub10, locked: level < 10 },
      25: { name: sub25, locked: level < 25 }
    }
  };
});

fs.writeFileSync(path.join(__dirname, 'test-roster.json'), JSON.stringify(roster, null, 2));
console.log(`Generated ${roster.length} entries -> test-roster.json`);
console.log('Specialty spread:', roster.reduce((a, p) => { a[p.specialty] = (a[p.specialty]||0)+1; return a; }, {}));
