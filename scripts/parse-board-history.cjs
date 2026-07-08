#!/usr/bin/env node
// Parses board/board-history-source.txt (a hand-normalized transcription of Luis's
// 3-year pasted board log - see that file's header comment for the format) into
// board/board-history.json, importable via the Board tab's IMPORT button.
//
// Validates every island code against gameData.json's real island names, and prints
// the computed final standings so they can be checked against the header checksum
// Luis gave from his own hand-tracked "Ranking Chart" (Omar 50.5, Luis 44.5, Jeriel 4)
// before this is trusted. Lines starting with "?" in the source are lower-confidence
// transcriptions (typo'd/ambiguous dates in the original paste) - included in the
// output (the win still happened) but with the note prefixed [unverified date] so
// it's visible in the app, and also listed separately here for review.
//
//   node scripts/parse-board-history.cjs

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const game = JSON.parse(fs.readFileSync(path.join(ROOT, "gameData.json"), "utf-8"));

const ISLAND_CODES = {
  G: "Greengrass Isle",
  C: "Cyan Beach",
  T: "Taupe Hollow",
  S: "Snowdrop Tundra",
  L: "Lapis Lakeside",
  P: "Old Gold Power Plant", // includes "O" from the source - same island, confirmed by Luis
  Exp: "Greengrass Isle (Expert Mode)",
  A: "Amber Canyon",
  Mix: "Mix",
};

const DISH_CODES = {
  curry: "Curries & Stews",
  salad: "Salads",
  dessert: "Desserts & Drinks",
};

const PLAYERS = ["Omar", "Luis", "Jeriel"];

const srcPath = path.join(ROOT, "board", "board-history-source.txt");
const lines = fs.readFileSync(srcPath, "utf-8").split("\n");

const weeks = [];
const flagged = [];
const errors = [];
let idCounter = 0;

for (const raw of lines) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;

  const uncertain = line.startsWith("?");
  const body = uncertain ? line.slice(1) : line;
  const parts = body.split("|");
  if (parts.length < 3) { errors.push(`Malformed line (need >=3 |-separated fields): ${line}`); continue; }

  const [dateLabel, islandCode, winnersRaw, dishCode, ...noteParts] = parts;
  let note = noteParts.join("|").trim();

  const island = ISLAND_CODES[islandCode.trim()];
  if (!island) { errors.push(`Unknown island code "${islandCode}" on line: ${line}`); continue; }
  if (island !== "Mix" && !game.islands[island]) { errors.push(`Island "${island}" not found in gameData.json: ${line}`); continue; }

  const winners = winnersRaw.split(",").map(w => w.trim()).filter(Boolean);
  if (winners.length === 0) { errors.push(`No winner(s) on line: ${line}`); continue; }
  for (const w of winners) {
    if (!PLAYERS.includes(w)) { errors.push(`Unknown player "${w}" on line: ${line}`); }
  }

  const dishType = dishCode.trim() ? DISH_CODES[dishCode.trim()] : "";
  if (dishCode.trim() && !dishType) { errors.push(`Unknown dish code "${dishCode}" on line: ${line}`); continue; }

  if (uncertain) note = note ? `[unverified date] ${note}` : "[unverified date]";

  const week = {
    id: `week_${++idCounter}_${Date.now()}`,
    dateLabel: dateLabel.trim(),
    island,
    winners,
    dishType: dishType || "",
    note,
  };
  weeks.push(week);
  if (uncertain) flagged.push(week);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s) - fix board-history-source.txt and rerun:\n`);
  errors.forEach(e => console.error("  " + e));
  process.exit(1);
}

// Standings checksum, same rule as the app's weekPoints(): ties split evenly.
const points = Object.fromEntries(PLAYERS.map(p => [p, 0]));
const wins = Object.fromEntries(PLAYERS.map(p => [p, 0]));
weeks.forEach(w => {
  w.winners.forEach(p => {
    points[p] += 1 / w.winners.length;
    wins[p] += 1;
  });
});

console.log(`Parsed ${weeks.length} weeks (${flagged.length} flagged as low-confidence date ranges).\n`);
console.log("Computed standings (compare against Luis's hand-tracked checksum: Omar 50.5, Luis 44.5, Jeriel 4):");
PLAYERS.forEach(p => console.log(`  ${p}: ${Math.round(points[p]*10)/10} pts (${wins[p]} wins)`));

if (flagged.length) {
  console.log(`\nLow-confidence rows (review these against the original paste):`);
  flagged.forEach(w => console.log(`  ${w.dateLabel} - ${w.island} - ${w.winners.join("/")}`));
}

const board = { players: PLAYERS, weeks, shinyLog: [], shinyBaseCounts: {} };
const outPath = path.join(ROOT, "board", "board-history.json");
fs.writeFileSync(outPath, JSON.stringify(board, null, 2));
console.log(`\nWrote ${outPath} - import it via the Board tab's IMPORT button.`);
