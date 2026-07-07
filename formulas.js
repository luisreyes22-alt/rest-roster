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
  // asymmetric), skill-chance natures are x1.2 / x0.8. The ingredient/energy/EXP axes
  // aren't part of this score model, so natures touching only those stay neutral here.
  function natureMods(natureName) {
    const n = GAME?.natures?.[natureName] || {};
    return {
      speed: n.buff === "Speed of help" ? 1.1 : n.nerf === "Speed of help" ? 0.925 : 1,
      skill: n.buff === "Main skill chance" ? 1.2 : n.nerf === "Main skill chance" ? 0.8 : 1,
    };
  }

  function totalScore(p) {
    const mods = natureMods(p.nature);
    return scoreSubskills(p.subskills, p.level) * 2
         + (3600 / freqToSecs(p.frequency)) * mods.speed
         + scoreMainSkill(p) * mods.skill;
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

  function buildTeam(roster, islandName, recipeName, expertSettings) {
    const island = GAME.islands[islandName];
    const acceptsAll = island.berries.includes("all");
    const berryMatch = p => acceptsAll || island.berries.includes(p.berry);

    const recipe = recipeName ? GAME.recipes.find(r => r.name === recipeName) : null;
    const requiredIngredients = recipe ? new Set(recipe.ingredients.map(i => i.ingredient)) : null;
    const ingredientMatch = p => requiredIngredients &&
      [...individualIngredientPool(p)].some(ing => requiredIngredients.has(ing));

    const isExpert = island.expert && expertSettings;

    // Score with island + recipe context: berry match and needed-ingredient match are bonuses
    function teamScore(p) {
      let s = totalScore(p);
      if (isExpert) {
        const tier = expertBerryTier(p, expertSettings);
        // Frequency multiplier (main 0.9x / sub 1.0x / none 1.15x) applied as an equivalent
        // helps/hour adjustment, on top of the base totalScore's own frequency term.
        const freqMult = tier === "main" ? 1/0.9 : tier === "sub" ? 1 : 1/1.15;
        s += (3600 / freqToSecs(p.frequency)) * (freqMult - 1);
        if (tier === "main") s += 2; // skill level +1 (capped) nudges main-skill power up
        if (tier !== "none" && expertSettings.randomBonus === p.specialty.toLowerCase().replace(/s$/, "")) {
          s += 6; // this week's bonus specialty rewards favored-berry members of that specialty
        }
      } else if (berryMatch(p)) {
        s += p.specialty === "Berries" ? 8 : 3;
      }
      if (ingredientMatch(p)) s += p.specialty === "Ingredients" ? 6 : 2;
      return s;
    }

    const pool = [...roster].sort((a,b) => teamScore(b) - teamScore(a));
    const team = [];
    const used = new Set();

    // filterFn narrows the candidate pool; scoreFn (optional) re-ranks just that slot's
    // candidates instead of relying on the pool's overall teamScore order, so a slot can
    // favor a trait (e.g. dish ingredient coverage) as a tiebreak without letting it
    // override a large raw-score gap.
    function pick(filterFn, role, scoreFn, reasonFn) {
      const candidates = pool.filter(p => !used.has(p.id) && filterFn(p));
      if (scoreFn) candidates.sort((a,b) => scoreFn(b) - scoreFn(a));
      const found = candidates[0];
      if (found) {
        used.add(found.id);
        team.push({...found, role, pickReason: reasonFn ? reasonFn(found) : undefined});
        return true;
      }
      return false;
    }

    // Slot 1: best Ingredient specialist that actually supplies the recipe (if one is chosen)
    if (requiredIngredients) {
      pick(p => p.specialty === "Ingredients" && ingredientMatch(p), "Ingredients (dish)",
        undefined, () => "Feeds this dish's ingredients directly");
    }
    // Slot 2: best Ingredient specialist overall (dish support)
    pick(p => p.specialty === "Ingredients", "Ingredients");
    // Slot 3: best Skill specialist (utility/energy). When a dish is selected, a small
    // tiebreak bonus lets a slightly lower-scored skill mon that also feeds the recipe's
    // ingredients win the slot over the objectively-top skill mon that doesn't - so the
    // same high-score skill specialist doesn't monopolize every team regardless of fit.
    pick(p => p.specialty === "Skills", "Skills / Utility",
      requiredIngredients ? p => teamScore(p) + (ingredientMatch(p) ? 4 : 0) : undefined,
      found => requiredIngredients && ingredientMatch(found)
        ? "Top skill pick that also feeds this dish"
        : "Highest-scoring skill specialist available");
    // Slot 4: best berry-matching Berry specialist (island synergy / main favorite first)
    if (isExpert) {
      pick(p => p.specialty === "Berries" && expertBerryTier(p, expertSettings) === "main", "Berries (main favorite)");
      pick(p => p.specialty === "Berries" && expertBerryTier(p, expertSettings) === "sub", "Berries (sub favorite)");
    } else {
      pick(p => p.specialty === "Berries" && berryMatch(p), "Berries (island)");
    }
    // Slots 5+: best remaining by score
    while (team.length < 5) {
      if (!pick(() => true, "Best available")) break;
    }

    // Analysis
    const specialties = team.reduce((acc,p) => { acc[p.specialty]=(acc[p.specialty]||0)+1; return acc; }, {});
    const warnings = [];
    if (!specialties["Ingredients"]) warnings.push("No ingredient specialist — cooking may fall short");
    if (!specialties["Skills"]) warnings.push("No skill specialist — less main skill utility");
    if (roster.length < 5) warnings.push(`You only have ${roster.length} Pokémon in the roster`);

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
    if (requiredIngredients) {
      const covered = new Set();
      team.forEach(p => individualIngredientPool(p).forEach(ing => { if (requiredIngredients.has(ing)) covered.add(ing); }));
      missingIngredients = [...requiredIngredients].filter(ing => !covered.has(ing));
      if (missingIngredients.length > 0) {
        warnings.push(`No team member produces: ${missingIngredients.join(", ")}`);
      }
    }

    return { team, specialties, matches, mainMatches, subMatches, isExpert, expertSettings, warnings, recipe, missingIngredients };
  }

  return {
    setGame, getGame,
    TIER_SCORES, SLOT_WEIGHTS, SLOT_LEVELS,
    getTier, isSubskillLocked, scoreSubskills, freqToSecs, scoreMainSkill, natureMods, totalScore,
    individualIngredientPool, expertBerryTier, buildTeam, EXPERT_BONUS_LABELS,
  };
});
