// Pure scoring / team-building formulas, shared between the browser app (loaded as a
// plain <script> before app.jsx, exposing window.Formulas) and node --test (via
// require("./formulas.cjs")). Kept dependency-free (no React, no DOM) so it can be
// tested in isolation - this is the "critical path" module called out in the roadmap
// before any build-step work: freezes score-rounding behavior so it can't drift silently.
//
// NOTE: this file is byte-identical to formulas.js at the repo root (and public/formulas.js
// for the Vite scaffold). It only exists under .cjs so require() works unambiguously now that
// package.json sets "type": "module" for Vite - .js files there default to ESM, which node's
// CommonJS require() can't load synchronously. Browsers don't care about the extension, only
// the content, so formulas.js stays the one actually served. If you edit the logic here, copy
// the same change into formulas.js and public/formulas.js (or just re-run: cp formulas.cjs
// formulas.js && cp formulas.cjs public/formulas.js).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Formulas = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Set once by the app after gameData.json loads. Every function below reads
  // through this rather than taking GAME as a parameter, matching the app's existing
  // "load once, read everywhere" pattern (see app.jsx's module-level GAME global).
  let GAME = null;
  function setGame(data) { GAME = data; }
  function getGame() { return GAME; }

  const TIER_SCORES  = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const SLOT_WEIGHTS = { 10: 1.5, 25: 1.25, 50: 1.0, 70: 0.75, 80: 0.5 };
  const SLOT_LEVELS  = [10, 25, 50, 70, 80];

  const getTier = n => (GAME?.subskills?.[n]?.tier) || "C";

  // A subskill slot is locked purely by the pokemon's CURRENT level. This is derived
  // at read time, never trusted from storage: the stored `locked` flag (still written
  // for backward compatibility) goes stale the moment a pokemon levels past a threshold.
  const isSubskillLocked = (pokemonLevel, slotLevel) => (parseInt(pokemonLevel) || 0) < slotLevel;

  function scoreSubskills(subskills, pokemonLevel) {
    let s = 0;
    for (const [slot, entry] of Object.entries(subskills || {})) {
      if (!entry || !entry.name) continue;
      if (isSubskillLocked(pokemonLevel, parseInt(slot))) continue;
      s += TIER_SCORES[getTier(entry.name)] * (SLOT_WEIGHTS[parseInt(slot)] || 1);
    }
    return Math.round(s * 10) / 10;
  }

  function freqToSecs(f) {
    if (typeof f === "number") return f;
    const m = String(f).match(/(\d+)\s*min[s]?\s*(\d+)?\s*sec[s]?/);
    if (m) return parseInt(m[1]) * 60 + (parseInt(m[2]) || 0);
    return 9999;
  }

  // Main skill contribution: relative curve value at the Pokemon's current skill
  // level, normalized against a baseline of 1.5 (a mid-tier lvl-1 skill) so it nudges
  // the score without overwhelming subskills/frequency.
  function scoreMainSkill(p) {
    const skillData = GAME?.mainSkills?.[p.mainSkill];
    if (!skillData) return 0;
    const lvl = Math.max(1, Math.min(p.mainSkillLevel || 1, skillData.maxLevel));
    const curveValue = skillData.relativeCurve[lvl - 1] || skillData.relativeCurve[0];
    return Math.round(((curveValue / 1.5) * 3) * 10) / 10; // scaled to ~0-7 range
  }

  // Nature modifiers, taken from nerolis-lab common/src/types/nature/nature.ts (not
  // guessed): +speed natures help at a x1.1 rate, -speed at x0.925 (the real game is
  // asymmetric), skill-chance natures are x1.2 / x0.8, ingredient-finding x1.2 / x0.8.
  // The energy/EXP axes aren't part of this score model, so natures touching only
  // those stay neutral here.
  function natureMods(natureName) {
    const n = GAME?.natures?.[natureName] || {};
    return {
      speed: n.buff === "Speed of help" ? 1.1 : n.nerf === "Speed of help" ? 0.925 : 1,
      skill: n.buff === "Main skill chance" ? 1.2 : n.nerf === "Main skill chance" ? 0.8 : 1,
      ing:   n.buff === "Ingredient finding" ? 1.2 : n.nerf === "Ingredient finding" ? 0.8 : 1,
    };
  }

  function totalScore(p) {
    const mods = natureMods(p.nature);
    return scoreSubskills(p.subskills, p.level) * 2
         + (3600 / freqToSecs(p.frequency)) * mods.speed
         + scoreMainSkill(p) * mods.skill;
  }

  // ── Team Builder v2: skill function classification ─────────────────────────
  // The raw main-skill score (scoreMainSkill) rates a skill by its GROWTH CURVE,
  // which made Charge Strength M Lv.7 (curve 7.79, steepest in the game) the "best"
  // skill in the game even though it contributes nothing to cooking. For team
  // building the skill's FUNCTION matters: what does firing it actually do for the
  // dish-first goal? Each of the 36 main skills in gameData maps to one function
  // class; the class weight scales the curve score on the team-context skill axis.
  // Weights are tuning constants - dish-first priority order agreed with Luis
  // (see docs/ROADMAP.md #2).
  const SKILL_FUNCTION_WEIGHTS = {
    cooking:  1.0,   // directly fills the pot: ingredients, pot size, extra-tasty
    sustain:  0.7,   // keeps the team helping: energy recovery/healing
    helper:   0.6,   // instant extra helps (berries+ingredients mixed)
    copy:     0.4,   // copies/randomizes another skill - sometimes cooking, sometimes not
    strength: 0.25,  // Snorlax strength only - real, but bottom of the dish-first order
    neutral:  0.1,   // shards/EXP/etc - no team value for this goal
  };
  const SKILL_FUNCTIONS = {
    "Ingredient Magnet S": "cooking",
    "Plus (Ingredient Magnet S)": "cooking",
    "Present (Ingredient Magnet S)": "cooking",
    "Ingredient Draw S": "cooking",
    "Hyper Cutter (Ingredient Draw S)": "cooking",
    "Super Luck (Ingredient Draw S)": "cooking",
    "Cooking Power-Up S": "cooking",
    "Minus (Cooking Power-Up S)": "cooking",
    "Cooking Assist S": "cooking",
    "Bulk Up (Cooking Assist S)": "cooking",
    "Tasty Chance S": "cooking",
    "Energy For Everyone S": "sustain",
    "Berry Juice (Energy For Everyone S)": "sustain",
    "Lunar Blessing (Energy For Everyone S)": "sustain",
    "Energizing Cheer S": "sustain",
    "Heal Pulse (Energizing Cheer S)": "sustain",
    "Nuzzle (Energizing Cheer S)": "sustain",
    "Charge Energy S": "sustain",
    "Moonlight (Charge Energy S)": "sustain",
    "Extra Helpful S": "helper",
    "Helper Boost": "helper",
    "Metronome": "copy",
    "Skill Copy": "copy",
    "Mimic (Skill Copy)": "copy",
    "Transform (Skill Copy)": "copy",
    "Versatile": "copy",
    "Charge Strength S": "strength",
    "Charge Strength S Range": "strength",
    "Charge Strength M": "strength",
    "Bad Dreams (Charge Strength M)": "strength",
    "Stockpile (Charge Strength S)": "strength",
    "Berry Burst": "strength",
    "Disguise (Berry Burst)": "strength",
    "Draco Meteor (Berry Burst)": "strength",
    "Dream Shard Magnet S": "neutral",
    "Dream Shard Magnet S Range": "neutral",
  };
  function skillFunction(skillName) { return SKILL_FUNCTIONS[skillName] || "neutral"; }

  // Function-weighted skill value for team building: same curve math as
  // scoreMainSkill, scaled by what the skill actually does for the team goal.
  function cookingSkillScore(p) {
    const w = SKILL_FUNCTION_WEIGHTS[skillFunction(p.mainSkill)];
    return Math.round(scoreMainSkill(p) * natureMods(p.nature).skill * w * 10) / 10;
  }

  // ── Team Builder v2: ingredient production-rate model ──────────────────────
  // Ingredient Finder subskill bonuses: community-established multipliers used by
  // Neroli's Lab and every public calculator (M +36%, S +18%, stacking additively).
  const INGREDIENT_FINDER_BONUS = { "Ingredient Finder M": 0.36, "Ingredient Finder S": 0.18 };

  // A pokemon's unlocked ingredient slots as expectation-friendly option lists.
  // Base slot is always active; Lv.30/Lv.60 slots only once reached. A known roll
  // narrows the slot to that one option (its amounts still come from species data);
  // unknown rolls keep every option the species can roll there, each equally likely.
  function activeIngredientSlots(p) {
    const sp = GAME.species[p.species];
    if (!sp) return [];
    const lvl = parseInt(p.level) || 0;
    const slots = [{ options: sp.ingredient0 }];
    if (lvl >= 30) {
      const known = p.ingredients?.["30"];
      slots.push({ options: known ? sp.ingredient30.filter(i => i.ingredient === known) : sp.ingredient30 });
    }
    if (lvl >= 60) {
      const known = p.ingredients?.["60"];
      slots.push({ options: known ? sp.ingredient60.filter(i => i.ingredient === known) : sp.ingredient60 });
    }
    return slots.filter(s => s.options.length > 0);
  }

  // Estimated units/hour of NEEDED ingredients this pokemon produces for a recipe.
  // Model (an estimate, not a simulation): each help procs ingredients with chance
  // ingredientPercent x nature x (1 + Ingredient Finder bonuses); a proc draws one
  // unlocked slot uniformly and yields that slot's amount of that slot's ingredient.
  // Frequency is the mon's measured in-game value, so Helping Speed subskills are
  // already baked in - only the nature speed modifier is applied on top here.
  // With no neededSet, rates ALL ingredient production (general throughput).
  function ingredientRate(p, neededSet) {
    const sp = GAME.species[p.species];
    if (!sp) return 0;
    const mods = natureMods(p.nature);
    const helpsPerHour = (3600 / freqToSecs(p.frequency)) * mods.speed;
    let finderBonus = 0;
    for (const [slot, entry] of Object.entries(p.subskills || {})) {
      if (!entry || !entry.name || isSubskillLocked(p.level, parseInt(slot))) continue;
      finderBonus += INGREDIENT_FINDER_BONUS[entry.name] || 0;
    }
    const ingChance = ((sp.ingredientPercent || 0) / 100) * mods.ing * (1 + finderBonus);
    const slots = activeIngredientSlots(p);
    if (slots.length === 0) return 0;
    // Expected needed-units per ingredient proc: uniform slot pick, then uniform
    // option pick within an unknown slot.
    let expectedPerProc = 0;
    for (const slot of slots) {
      let slotExpect = 0;
      for (const opt of slot.options) {
        if (!neededSet || neededSet.has(opt.ingredient)) slotExpect += opt.amount;
      }
      expectedPerProc += (slotExpect / slot.options.length) / slots.length;
    }
    return Math.round(helpsPerHour * ingChance * expectedPerProc * 100) / 100;
  }

  // Level-gated ingredient pool for a specific pokemon. Slot 1 is always the species'
  // base ingredient (never stored - derived, like subskill locks). Slots 2/3 only exist
  // once the pokemon reaches Lv.30/Lv.60; when the individual's actual roll for a slot
  // is known (p.ingredients["30"]/["60"]) only that ingredient counts, otherwise every
  // option the species can roll there is assumed possible.
  function individualIngredientPool(p) {
    const sp = GAME.species[p.species];
    if (!sp) return new Set();
    const pool = new Set(sp.ingredient0.map(i => i.ingredient));
    const lvl = parseInt(p.level) || 0;
    if (lvl >= 30) {
      const chosen = p.ingredients?.["30"];
      (chosen ? [chosen] : sp.ingredient30.map(i => i.ingredient)).forEach(i => pool.add(i));
    }
    if (lvl >= 60) {
      const chosen = p.ingredients?.["60"];
      (chosen ? [chosen] : sp.ingredient60.map(i => i.ingredient)).forEach(i => pool.add(i));
    }
    return pool;
  }

  function expertBerryTier(p, expertSettings) {
    if (!expertSettings) return "none";
    if (p.berry === expertSettings.mainBerry) return "main";
    if (expertSettings.subBerries.includes(p.berry)) return "sub";
    return "none";
  }

  const EXPERT_BONUS_LABELS = { ingredient: "Ingredients", berry: "Berries", skill: "Skills" };

  // ── Team Builder v2 (see docs/ROADMAP.md #2, agreed 2026-07-08) ─────────────
  // No reserved specialty slots. Each candidate is scored on four weighted axes
  // (dish production > cooking-support skills > berry match > meta tier, plus a
  // small "base quality" background term), and 5 picks are made greedily with
  // MARGINAL dish value: every pick decrements the recipe's remaining ingredient
  // demand, so a redundant producer of already-covered ingredients loses value and
  // coverage wins. Any specialty can take any seat.
  //
  // All tuning lives here. Axis raw ranges differ (dish ~0-2.5 units/hr, skills
  // ~0-10, berry ~0-8, base ~0-45, meta 0-4), so the weights both scale and rank:
  const TEAM_AXIS_WEIGHTS = {
    dish:  12,    // units/hr of needed ingredients (marginal vs remaining demand)
    skills: 0.8,  // function-weighted main-skill value (cookingSkillScore)
    berry:  0.5,  // island/expert berry synergy
    base:   0.15, // general quality floor: subskills + helps/hr keep seats sane when other axes tie
    meta:   0.4,  // community tier (GAME.metaTiers, optional) - light tiebreak only
  };
  // Nominal daytime helping hours a pick "contributes" before the next cook - only
  // used to decay remaining demand between greedy picks (bigger = fewer mons needed
  // per ingredient before it counts as covered).
  const DEMAND_WINDOW_HOURS = 8;
  // Repeated same-function skills (e.g. two Energy For Everyone) are worth less
  // each time: multiplier applied once per already-picked mon sharing the function.
  const SKILL_STACK_DECAY = 0.6;
  const META_TIER_SCORES = { S: 4, A: 3, B: 2, C: 1 };

  // Per-ingredient expected units/hour, same model as ingredientRate but broken out
  // by ingredient so buildTeam can track marginal coverage per recipe line.
  function ingredientRatesByName(p) {
    const sp = GAME.species[p.species];
    if (!sp) return {};
    const mods = natureMods(p.nature);
    const helpsPerHour = (3600 / freqToSecs(p.frequency)) * mods.speed;
    let finderBonus = 0;
    for (const [slot, entry] of Object.entries(p.subskills || {})) {
      if (!entry || !entry.name || isSubskillLocked(p.level, parseInt(slot))) continue;
      finderBonus += INGREDIENT_FINDER_BONUS[entry.name] || 0;
    }
    const ingChance = ((sp.ingredientPercent || 0) / 100) * mods.ing * (1 + finderBonus);
    const slots = activeIngredientSlots(p);
    const rates = {};
    for (const slot of slots) {
      for (const opt of slot.options) {
        const perHour = helpsPerHour * ingChance * (opt.amount / slot.options.length) / slots.length;
        rates[opt.ingredient] = (rates[opt.ingredient] || 0) + perHour;
      }
    }
    return rates;
  }

  function buildTeam(roster, islandName, recipeName, expertSettings) {
    const island = GAME.islands[islandName];
    const acceptsAll = island.berries.includes("all");
    const berryMatch = p => acceptsAll || island.berries.includes(p.berry);

    const recipe = recipeName ? GAME.recipes.find(r => r.name === recipeName) : null;
    const requiredIngredients = recipe ? new Set(recipe.ingredients.map(i => i.ingredient)) : null;

    const isExpert = island.expert && expertSettings;

    // Expert-mode favored berries change help frequency (main 0.9x / sub 1.0x /
    // none 1.15x), which scales BOTH dish production and general output.
    function expertFreqMult(p) {
      if (!isExpert) return 1;
      const tier = expertBerryTier(p, expertSettings);
      return tier === "main" ? 1/0.9 : tier === "sub" ? 1 : 1/1.15;
    }

    function berryAxis(p) {
      if (isExpert) {
        const tier = expertBerryTier(p, expertSettings);
        let v = tier === "main" ? 8 : tier === "sub" ? 4 : 0;
        if (tier !== "none" && expertSettings.randomBonus === p.specialty.toLowerCase().replace(/s$/, "")) {
          v += 6; // this week's bonus specialty rewards favored-berry members of that specialty
        }
        if (tier === "main") v += 2; // main favorite also gets skill level +1 in-game
        return v;
      }
      if (!berryMatch(p)) return 0;
      return p.specialty === "Berries" ? 8 : 3;
    }

    function metaAxis(p) {
      const tier = GAME.metaTiers?.[p.species];
      return META_TIER_SCORES[tier] || 0;
    }

    // General quality floor: subskills + output tempo only. The main skill is
    // deliberately NOT included here - it already has its own axis, and counting it
    // twice let a steep strength curve leak back in through the base term.
    function baseAxis(p) {
      const mods = natureMods(p.nature);
      return scoreSubskills(p.subskills, p.level) * 2
           + (3600 / freqToSecs(p.frequency)) * mods.speed * expertFreqMult(p);
    }

    // Remaining demand per recipe ingredient, decremented after each pick so the
    // next candidate is valued against what's still missing (greedy-marginal).
    const originalDemand = {};
    const remainingDemand = {};
    if (recipe) recipe.ingredients.forEach(i => { originalDemand[i.ingredient] = i.amount; remainingDemand[i.ingredient] = i.amount; });

    function dishAxis(p, rates) {
      if (!recipe) {
        // No specific dish: reward general ingredient throughput at half strength so
        // island/berry context still matters on a plain build.
        return ingredientRate(p) * expertFreqMult(p) * 0.5;
      }
      let v = 0;
      for (const [ing, rate] of Object.entries(rates)) {
        if (!(ing in remainingDemand)) continue;
        v += rate * (remainingDemand[ing] / originalDemand[ing]);
      }
      return v * expertFreqMult(p);
    }

    const skillFnCounts = {}; // picked-so-far count per skill function, for stacking decay

    function skillsAxis(p) {
      const fn = skillFunction(p.mainSkill);
      const decay = Math.pow(SKILL_STACK_DECAY, skillFnCounts[fn] || 0);
      return cookingSkillScore(p) * decay;
    }

    // Rates depend only on the pokemon (not the recipe or picks) - compute once per
    // build. Matters most for bestAchievableDish, which runs buildTeam per recipe.
    const ratesById = new Map(roster.map(p => [p.id, ingredientRatesByName(p)]));

    function axisBreakdown(p) {
      const rates = ratesById.get(p.id);
      const dish = dishAxis(p, rates) * TEAM_AXIS_WEIGHTS.dish;
      const skills = skillsAxis(p) * TEAM_AXIS_WEIGHTS.skills;
      const berry = berryAxis(p) * TEAM_AXIS_WEIGHTS.berry;
      const base = baseAxis(p) * TEAM_AXIS_WEIGHTS.base;
      const meta = metaAxis(p) * TEAM_AXIS_WEIGHTS.meta;
      return { dish, skills, berry, base, meta, total: dish + skills + berry + base + meta, rates };
    }

    function roleFor(p, b) {
      const top = Math.max(b.dish, b.skills, b.berry);
      if (top <= 0.5) return "Best available";
      if (b.dish === top) return recipe ? "Dish engine" : "Ingredients";
      if (b.skills === top) return "Cooking support";
      if (isExpert) {
        const tier = expertBerryTier(p, expertSettings);
        if (tier === "main") return "Berries (main favorite)";
        if (tier === "sub") return "Berries (sub favorite)";
      }
      return "Berries (island)";
    }

    function reasonFor(p, b) {
      const parts = [];
      if (b.dish > 0.5) {
        const needed = recipe
          ? Object.entries(b.rates).filter(([ing]) => ing in remainingDemand).map(([ing, r]) => `${ing} ~${Math.round(r*10)/10}/hr`).join(", ")
          : `~${ingredientRate(p)}/hr total ingredients`;
        parts.push(`dish +${Math.round(b.dish*10)/10} (${needed})`);
      }
      if (b.skills > 0.5) parts.push(`skills +${Math.round(b.skills*10)/10} (${p.mainSkill} · ${skillFunction(p.mainSkill)})`);
      if (b.berry > 0.5) parts.push(`berry +${Math.round(b.berry*10)/10}`);
      if (b.meta > 0.5) parts.push(`meta +${Math.round(b.meta*10)/10}`);
      return parts.length ? parts.join(" · ") : "Best remaining overall quality";
    }

    const team = [];
    const used = new Set();

    while (team.length < 5) {
      let best = null, bestBreakdown = null;
      for (const p of roster) {
        if (used.has(p.id)) continue;
        const b = axisBreakdown(p);
        if (!best || b.total > bestBreakdown.total) { best = p; bestBreakdown = b; }
      }
      if (!best) break;
      used.add(best.id);
      team.push({ ...best, role: roleFor(best, bestBreakdown), pickReason: reasonFor(best, bestBreakdown) });
      // Marginal updates: this pick's expected production eats remaining demand,
      // and its skill function makes repeats of the same function worth less.
      if (recipe) {
        for (const [ing, rate] of Object.entries(bestBreakdown.rates)) {
          if (ing in remainingDemand) {
            remainingDemand[ing] = Math.max(0, remainingDemand[ing] - rate * expertFreqMult(best) * DEMAND_WINDOW_HOURS);
          }
        }
      }
      const fn = skillFunction(best.mainSkill);
      skillFnCounts[fn] = (skillFnCounts[fn] || 0) + 1;
    }

    // Analysis
    const specialties = team.reduce((acc,p) => { acc[p.specialty]=(acc[p.specialty]||0)+1; return acc; }, {});
    const warnings = [];
    if (roster.length < 5) warnings.push(`You only have ${roster.length} Pokémon in the roster`);
    // The rate model assumes helps keep flowing; in the real game helpers slow down
    // at low energy, so an all-producer team with no energy skill overestimates
    // its own output. Flag it rather than model it.
    const hasSustain = team.some(p => skillFunction(p.mainSkill) === "sustain");
    if (!hasSustain) warnings.push("No energy-recovery skill on the team — real production will run below these estimates as energy drains");

    let matches, mainMatches, subMatches;
    if (isExpert) {
      mainMatches = team.filter(p => expertBerryTier(p, expertSettings) === "main").length;
      subMatches = team.filter(p => expertBerryTier(p, expertSettings) === "sub").length;
      matches = mainMatches + subMatches;
      if (mainMatches === 0) warnings.push("No team member has this week's main favorite berry — missing the frequency and skill-level bonus");
      const bonusKey = expertSettings.randomBonus;
      const bonusSpecialty = bonusKey === "ingredient" ? "Ingredients" : bonusKey === "berry" ? "Berries" : "Skills";
      const hasBonusSynergy = team.some(p => p.specialty === bonusSpecialty && expertBerryTier(p, expertSettings) !== "none");
      if (!hasBonusSynergy) warnings.push(`This week's ${EXPERT_BONUS_LABELS[bonusKey]} bonus needs a favored-berry ${bonusSpecialty} specialist to pay off - none made the team`);
    } else {
      matches = team.filter(berryMatch).length;
      if (matches < 2) warnings.push("Few Pokémon matching the island berries — low Drowsy Power");
    }

    let missingIngredients = [];
    let coveragePct = null;
    if (requiredIngredients) {
      const covered = new Set();
      team.forEach(p => individualIngredientPool(p).forEach(ing => { if (requiredIngredients.has(ing)) covered.add(ing); }));
      missingIngredients = [...requiredIngredients].filter(ing => !covered.has(ing));
      if (missingIngredients.length > 0) {
        warnings.push(`No team member produces: ${missingIngredients.join(", ")}`);
      }
      // Expected demand coverage over the demand window: how much of the recipe's
      // total ingredient amounts the team's combined production is estimated to
      // supply. remainingDemand was decremented pick-by-pick above, so this falls
      // out of the greedy bookkeeping for free.
      const totalDemand = Object.values(originalDemand).reduce((a,b)=>a+b, 0);
      const totalRemaining = Object.values(remainingDemand).reduce((a,b)=>a+b, 0);
      coveragePct = totalDemand > 0 ? Math.round((1 - totalRemaining / totalDemand) * 100) : null;
      if (coveragePct !== null && coveragePct < 60 && missingIngredients.length === 0) {
        warnings.push(`Team covers only ~${coveragePct}% of this dish's ingredient amounts — expect to fill the gap from stock`);
      }
    }

    return { team, specialties, matches, mainMatches, subMatches, isExpert, expertSettings, warnings, recipe, missingIngredients, coveragePct };
  }

  // Best-achievable-dish: instead of the player guessing which dish to select,
  // evaluate every recipe (optionally one meal type) as
  //   achievable = recipe value x (1 + bonus%) x expected coverage
  // and return them ranked. A 5000-value dish the roster can only 40%-supply loses
  // to a 3500-value dish it fully covers - which is the honest answer to "what's
  // the highest dish we can actually cook".
  function bestAchievableDish(roster, islandName, expertSettings, mealType) {
    const recipes = GAME.recipes.filter(r => !mealType || r.type === mealType);
    const ranked = recipes.map(recipe => {
      const result = buildTeam(roster, islandName, recipe.name, expertSettings);
      const fullValue = recipe.value * (1 + (recipe.bonusPercent || 0) / 100);
      const achievable = Math.round(fullValue * (result.coveragePct || 0) / 100);
      return { recipe, result, achievable, fullValue: Math.round(fullValue) };
    });
    ranked.sort((a, b) => b.achievable - a.achievable);
    return ranked;
  }

  return {
    setGame, getGame,
    TIER_SCORES, SLOT_WEIGHTS, SLOT_LEVELS,
    getTier, isSubskillLocked, scoreSubskills, freqToSecs, scoreMainSkill, natureMods, totalScore,
    SKILL_FUNCTIONS, SKILL_FUNCTION_WEIGHTS, skillFunction, cookingSkillScore,
    INGREDIENT_FINDER_BONUS, activeIngredientSlots, ingredientRate, ingredientRatesByName,
    individualIngredientPool, expertBerryTier, buildTeam, bestAchievableDish, EXPERT_BONUS_LABELS,
  };
});
