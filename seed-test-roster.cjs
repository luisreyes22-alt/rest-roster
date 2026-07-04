// Generates a 100-pokemon test roster from real gameData.json for QA of the team builder.
// Run `node seed-test-roster.cjs`, then in the app use Roster > IMPORT and pick test-roster.json.
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'gameData.json'), 'utf-8'));

const TARGET = 100;

// Pokemon added to the game during 2026 - always included so tests cover the newest data.
const RECENT_2026 = ['Rufflet', 'Braviary', 'Cutiefly', 'Ribombee', 'Dedenne', 'Sandshrew', 'Sandslash', 'Latios', 'Latias'];

const NATURES = Object.keys(data.natures);
const SUBSKILLS = Object.keys(data.subskills);

function pick(arr, seed) {
  return arr[seed % arr.length];
}

// Bucket every species by specialty, keeping a stable order.
const bySpecialty = {};
for (const name of Object.keys(data.species)) {
  (bySpecialty[data.species[name].specialty] ||= []).push(name);
}

// Start with the 2026 additions, then round-robin the buckets for a balanced spread.
const chosen = [];
const used = new Set();
for (const name of RECENT_2026) {
  if (!data.species[name]) throw new Error(`Missing 2026 species in gameData.json: ${name}`);
  chosen.push(name);
  used.add(name);
}
const order = ['Berries', 'Ingredients', 'Skills', 'All'];
const cursors = { Berries: 0, Ingredients: 0, Skills: 0, All: 0 };
let lane = 0;
while (chosen.length < TARGET) {
  const spec = order[lane % order.length];
  lane++;
  const bucket = bySpecialty[spec] || [];
  while (cursors[spec] < bucket.length && used.has(bucket[cursors[spec]])) cursors[spec]++;
  if (cursors[spec] >= bucket.length) continue;
  const name = bucket[cursors[spec]++];
  chosen.push(name);
  used.add(name);
}

const roster = chosen.map((name, idx) => {
  const sp = data.species[name];
  const level = 25 + ((idx * 7) % 51); // spread 25-75
  const nature = pick(NATURES, idx * 3 + 1);
  const sub10 = pick(SUBSKILLS, idx);
  const sub25 = pick(SUBSKILLS, idx + 5);
  return {
    id: `test_${idx}_${name.replace(/[^a-zA-Z0-9]/g, '')}`,
    name,
    species: name,
    specialty: sp.specialty,
    berry: sp.berry,
    mainSkill: sp.mainSkill,
    mainSkillLevel: 1 + (idx % 4),
    level,
    rp: 800 + idx * 25,
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
console.log('Unique berries:', new Set(roster.map(p => p.berry)).size);
console.log('2026 additions included:', RECENT_2026.filter(n => roster.some(p => p.species === n)).join(', '));
