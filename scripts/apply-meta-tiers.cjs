#!/usr/bin/env node
// Merges meta-tiers.json (a hand-curated species -> S/A/B/C/D snapshot, sourced from
// a community tier list - see docs/ROADMAP.md #2) into gameData.json's "metaTiers"
// key, which the Team Builder's meta axis reads (formulas.cjs's buildTeam -> metaAxis).
//
// To refresh: update meta-tiers.json (re-derive from a current community tier list -
// Game8's "Best Helper Pokemon Tier List" is the most exhaustive as of 2026-07),
// then rerun this script. It's a light tiebreak axis (weight 0.4 of the total), not
// load-bearing, so staleness here is low-risk - refresh occasionally, not urgently.
//
//   node scripts/apply-meta-tiers.cjs

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const game = JSON.parse(fs.readFileSync(path.join(ROOT, "gameData.json"), "utf-8"));
const tiers = JSON.parse(fs.readFileSync(path.join(ROOT, "meta-tiers.json"), "utf-8"));

const unknown = Object.keys(tiers).filter(s => !game.species[s]);
if (unknown.length) {
  console.error("meta-tiers.json has species not found in gameData.json:", unknown);
  process.exit(1);
}

game.metaTiers = tiers;
fs.writeFileSync(path.join(ROOT, "gameData.json"), JSON.stringify(game, null, 2));
console.log(`Applied ${Object.keys(tiers).length} meta tiers to gameData.json (of ${Object.keys(game.species).length} species).`);
