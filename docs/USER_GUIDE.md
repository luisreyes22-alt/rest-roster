# DrowsyCraft - user guide

A personal PWA to compare Pokemon Sleep helpers, keep a roster, and build the
best weekly team - built for a running Drowsy Power competition between two
players. Works offline once installed (Add to Home Screen).

## Add

Enter a Pokemon you own. Type a species name and pick it from the
autocomplete - this fills in its main skill, base help frequency, and carry
limit automatically from real game data, so you only need to type what's
specific to *your* Pokemon: nickname, level, RP, nature, and subskills.

- **Species / Main Skill / Main Skill Level**: Main Skill is a dropdown of
  every valid skill in the game (auto-selected from the species, editable if
  it doesn't match what you see in-game) - no more typos from free-text
  entry. Main skill level matters a lot for scoring, since a level 1 Bulk Up
  and a level 6 Bulk Up are very different in practice.
- **Frequency**: auto-filled with the species' base value. Adjust it only if
  you've confirmed your specific Pokemon's actual timer differs.
- **Subskills**: level 10 and level 25 are required to save; 50/70/80 are
  optional and gray out with a lock icon if your Pokemon isn't high enough
  level yet.
- If the Save button is grayed out, a line below it tells you exactly what's
  missing (e.g. "Missing: nature, Lv.10 subskill").
- While entering several Pokemon in a row, a counter above the form tracks
  how many you've saved this session, with an **UNDO LAST** button in case
  you fat-fingered the last one.
- **Ingredients (optional)**: record which ingredient your Pokemon actually
  rolled at Lv.30 and Lv.60 (the dropdowns only offer that species' possible
  options, and lock below the unlock level). Leaving them as "unknown" is
  safe - the Team Builder then assumes any of the species' options - but
  filling them in makes dish matching precise.
- **Compare** vs **Save to roster**: Compare adds it to a temporary
  side-by-side list (cleared on refresh); Save to roster keeps it permanently
  in local storage.

## Compare

Shows every Pokemon you've added to the comparison list, ranked by score,
with a recommendation banner naming the top pick. Use this before deciding
which Pokemon to invest candy/subskill resources into - once you're done
comparing, either add the winner to your roster or clear the list.

## Roster

Your permanent collection. Each entry shows collapsed (sprite, name,
species, RP) - tap a row to expand it and see full stats, subskills, and the
edit/remove buttons.

- **Search**: filter by nickname or species as you type.
- **Sort**: best overall (score), RP (high or low first), name (A-Z/Z-A),
  Pokédex number, level, or specialty.
- **Export**: downloads your whole roster as a `.json` file - useful as a
  backup, or to move your roster to another device/browser.
- **Import**: loads a `.json` file (your own export, or one shared by someone
  else) and merges it into your current roster. Pokemon with an ID already in
  your roster are skipped, so importing twice is safe. Entries with data the
  game doesn't recognize (unknown species, skills, subskills, or ingredients,
  bad levels) are rejected, and the confirmation message tells you how many
  came in, were already owned, or were rejected and why.
- **Remove** asks for a second tap ("tap again to remove") before actually
  deleting - a stray touch can't wipe out a Pokemon anymore.

## Pokedex

A collection view of your roster grouped by species: one tile per unique
species you own (sprite, name, dex number), ordered by Pokédex number, with
an "x3"-style badge when you own more than one of a species. Tap a tile to
expand it inline and see every individual of that species as regular roster
cards (tap again to collapse; opening one species closes the previous).

## Team

Builds a 5-Pokemon team from your roster for a specific week, considering two
things Snorlax cares about:

1. **Island of the week** (required) - determines which berries count toward
   Drowsy Power. The team builder prioritizes roster members whose berry
   matches the island.

   **Expert islands** (currently Greengrass Isle Expert Mode) work
   differently: instead of a fixed berry list, each week has 1 main
   favorite berry + 2 sub favorites drawn from all 18, plus one random
   bonus (Ingredients, Berries, or Skills). Selecting an expert island
   reveals extra dropdowns to enter that week's settings from the in-game
   island screen. The team builder then favors main-berry Pokemon (they
   help 10% faster and get +1 skill level) over sub-favorite (normal
   speed) over unfavored (15% slower), and gives extra weight to whichever
   specialty this week's bonus rewards.
2. **Snorlax dish** (optional) - once you pick an island, a "Top Dishes"
   gallery shows the top 5 highest-value dishes for each meal type (Curries
   & Stews, Salads, Desserts & Drinks). Tap any dish to see its own
   recommended team (and a warning if nobody in your roster produces one of
   its ingredients) without leaving the island you picked. There's also a
   plain dropdown below the gallery if you want a specific dish that isn't
   in the top 5.

The result shows a balance summary (how many Berries/Ingredients/Skills
specialists made the team, and how many match the island), any warnings, and
the 5 chosen Pokemon each tagged with why they were picked. All 5 show
collapsed together so you can see the whole team at a glance - tap any of
them to expand its full stats.

## Common workflows

**Just caught a new Pokemon?** Go to Add, type its species, fill in level and
nature from the game, set its subskills as you unlock them, save to roster.

**Deciding whether a new catch is worth investing in?** Add it, hit Compare
instead of Save, then add your current best of the same specialty and see
which one the recommendation banner favors.

**Planning this week's team?** Check the island and Snorlax's requested dish
in-game first, then go to Team, select both, and build.

## Session log

- **2026-07-06 (scoring honesty + ingredients)**: Subskill lock state is now
  derived from the Pokemon's current level instead of frozen at save time,
  so leveling past 50/70/80 immediately counts those subskills. Imports are
  validated against real game data (bad entries rejected with reasons).
  Cards show the SCORE the lists sort by, and natures finally affect it
  (real multipliers from Neroli's Lab: +speed x1.1 / -speed x0.925, skill
  chance x1.2 / x0.8) - 107 of 154 roster scores shifted. New optional
  Lv.30/Lv.60 ingredient fields on the Add form make dish matching honest:
  a Pokemon only "covers" ingredients its level can actually produce.
  Removing a Pokemon now takes a confirming second tap. Under the hood, the
  app code moved from inline in index.html to app.jsx, and the roster
  build script is checked in at scripts/build-roster.cjs.
- **2026-07-06 (rebrand + Pokedex)**: The app is now called **DrowsyCraft**
  (was "Sleep Optimizer") - title, header, and PWA install name all updated.
  New Pokedex tab: your roster grouped by species, one tile per unique
  species sorted by dex number with an ownership count badge; tap a tile to
  expand all your copies of that species inline. Fixed 9 more misidentified
  Pokemon, all evolution-stage mix-ups (Goomba is a Quagsire, not Wooper;
  Blue, Cortés, and SsgssBeebs are Blastoise, not Wartortle; Dr.Wiggly-S is
  Wigglytuff; Kykio is Gardevoir, not Ralts; Hot Dog and David are Aggron,
  not Aron; Pippi BF is Clefable, not Clefairy).
- **2026-07-06 (usability pass 2)**: App icon and header logo are now Luis's
  dog instead of the moon (the light/dark toggle keeps its sun/moon icons -
  those are functional). Roster gained search and 8 sort options
  (RP/name/Pokédex number/level/specialty/score). The Add form's Main Skill
  is now a dropdown (was free text - typos there silently broke scoring), a
  "Missing: ..." hint appears under the disabled Save button, and a session
  counter with an Undo Last button helps when entering many Pokemon in a
  row. Team Builder's dish picker became a "Top Dishes" gallery: pick an
  island, then browse the top 5 highest-value dishes per meal type with
  each one's recommended team shown inline. Fixed a misidentified Pokemon
  (Hughie was tagged Natu, is actually Xatu).
- **2026-07-06 (usability pass)**: Roster and Team result lists now show
  Pokemon collapsed (with a species face icon) by default - tap a row to
  expand full details. Team result shows all 5 members together instead of
  a long scroll. Visual theme switched from the warm amber palette to a
  Greengrass Isle-inspired green/sky palette (light and dark).
- **2026-07-06 (later)**: Luis's real roster grew from 101 to 154 Pokemon -
  53 more bulk-extracted from new in-game screenshots and merged into the
  same importable file. Load the updated file via Roster > IMPORT (existing
  IDs are unchanged, so re-importing only adds the new ones).
- **2026-07-06**: Team Builder now supports Greengrass Isle (Expert Mode) -
  weekly main/sub favorite berries and a random bonus (Ingredients/Berries/
  Skills), with real formulas sourced from Neroli's Lab's own code (main
  favorite = 10% faster help + skill level +1, sub = normal, neither = 15%
  slower). Verified against Luis's real roster.
- **2026-07-04 (later)**: Game data gained Mew (with its Versatile skill) and
  the previously missing Helping Bonus subskill. Luis's real roster (101
  Pokemon) was bulk-extracted from in-game screenshots into an importable
  file - load it via Roster > IMPORT.
- **2026-07-04**: Visual redesign - warm cream/amber theme replacing the
  original dark purple, Tabler icons replacing emoji, added a light/dark
  toggle. Functionality unchanged. This guide created.
- **2026-07-04**: Team Builder gained the "Snorlax dish" selector and
  ingredient-aware team picking. UI translated to English. gameData
  refreshed and audited against official 2026 updates (231 species, 76
  recipes, includes all Pokemon added through the June 2026 update).
- **2026-07-03**: Roster gained species autofill (frequency, carry limit).
  Initial release: Add, Compare, Roster, and a basic island-only Team
  Builder, backed by real Neroli's Lab game data.
