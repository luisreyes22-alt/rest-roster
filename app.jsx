const { useState, useEffect, useRef } = React;

// ── Tier config ───────────────────────────────────────────────────────────────
const TIER_COLORS = { S:"var(--tier-s)", A:"var(--tier-a)", B:"var(--tier-b)", C:"var(--tier-c)", D:"var(--tier-d)" };
const TIER_BG = { S:"var(--tier-s-bg)", A:"var(--tier-a-bg)", B:"var(--tier-b-bg)", C:"var(--tier-c-bg)", D:"var(--tier-d-bg)" };
// Pure scoring/team-building formulas live in formulas.js (loaded as a plain <script>
// before this file - see index.html) so they can be covered by node --test without a
// build step. This app only wires them to GAME/UI; never redefine them here.
const { TIER_SCORES, SLOT_WEIGHTS, SLOT_LEVELS, getTier, isSubskillLocked, scoreSubskills,
  freqToSecs, scoreMainSkill, natureMods, totalScore, individualIngredientPool,
  expertBerryTier, buildTeam, bestAchievableDish, EXPERT_BONUS_LABELS } = window.Formulas;
const VIEWS = { ADD:"add", COMPARE:"compare", ROSTER:"roster", POKEDEX:"pokedex", TEAM:"team", BOARD:"board" };

// Region boundaries by National Pokédex number. Regional forms (Alolan/Paldean/etc.) keep
// their base species' dex number in gameData, so they naturally sit with their home region.
const REGIONS = [
  { name: "Kanto",  min: 1,   max: 151 },
  { name: "Johto",  min: 152, max: 251 },
  { name: "Hoenn",  min: 252, max: 386 },
  { name: "Sinnoh", min: 387, max: 493 },
  { name: "Unova",  min: 494, max: 649 },
  { name: "Kalos",  min: 650, max: 721 },
  { name: "Alola",  min: 722, max: 809 },
  { name: "Galar",  min: 810, max: 905 },
  { name: "Paldea", min: 906, max: 99999 },
];
function regionFor(dexNo) {
  return REGIONS.find(r => dexNo >= r.min && dexNo <= r.max)?.name || "Other";
}

// ── Global game data (loaded async) ──────────────────────────────────────────
let GAME = null;
let SPRITE_IDS = null;
const SPECIALTY_COLOR = { Berries:"var(--specialty-berries)", Ingredients:"var(--specialty-ingredients)", Skills:"var(--specialty-skills)", All:"var(--specialty-all)" };
function spriteUrl(species, isShiny) {
  const id = SPRITE_IDS?.[species];
  if (!id) return null;
  const shinyPart = isShiny ? "shiny/" : "";
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${shinyPart}${id}.png`;
}

let _idCounter = 0;
const makeId = n => `${n}_${Date.now()}_${++_idCounter}`;

// ── UI atoms ──────────────────────────────────────────────────────────────────
function Icon({name, size, style}) {
  return <i className={`ph-fill ph-${name}`} style={{fontSize:size||16,lineHeight:1,...style}} aria-hidden="true"/>;
}

function PokemonSprite({species, size, isShiny}) {
  const [broken, setBroken] = useState(false);
  const url = spriteUrl(species, isShiny);
  const s = size || 40;
  if (!url || broken) {
    return (
      <div style={{width:s,height:s,borderRadius:"50%",background:"var(--surface-alt)",
        border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",
        flexShrink:0,fontSize:s*0.4,fontWeight:700,color:"var(--text-muted)",position:"relative"}}>
        {species?.[0] || "?"}
        {isShiny && <Icon name="sparkle" size={s*0.32} style={{position:"absolute",top:-2,right:-2,color:"var(--tier-s)"}}/>}
      </div>
    );
  }
  return (
    <div style={{width:s,height:s,borderRadius:"50%",background:"var(--surface-alt)",
      border:`1px solid ${isShiny?"var(--tier-s)":"var(--border)"}`,overflow:"hidden",flexShrink:0,position:"relative"}}>
      <img src={url} alt={species} loading="lazy" onError={()=>setBroken(true)}
        style={{width:"100%",height:"100%",objectFit:"contain"}}/>
      {isShiny && <Icon name="sparkle" size={s*0.32} style={{position:"absolute",top:-2,right:-2,color:"var(--tier-s)",
        filter:"drop-shadow(0 0 2px var(--surface))"}}/>}
    </div>
  );
}

function SubskillBadge({name, locked, level}) {
  if (!name) return null;
  const tier = getTier(name);
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,
      background:locked?"var(--surface-alt)":TIER_BG[tier],
      border:`1px solid ${locked?"var(--border)":TIER_COLORS[tier]}`,
      opacity:locked?0.6:1,marginBottom:5}}>
      {locked
        ? <Icon name="lock" size={12} style={{color:"var(--text-muted)"}}/>
        : <span style={{fontSize:10,fontWeight:700,color:TIER_COLORS[tier],
            fontFamily:"'JetBrains Mono', monospace",minWidth:14}}>{tier}</span>}
      <span style={{fontSize:11,color:locked?"var(--text-muted)":"var(--text-primary)"}}>{name}</span>
      <span style={{fontSize:9,color:"var(--text-secondary)",marginLeft:"auto",fontFamily:"'JetBrains Mono', monospace"}}>Lv.{level}</span>
    </div>
  );
}

function RadarBar({label, value, max, color}) {
  return (
    <div style={{marginBottom:6}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>{label}</span>
        <span style={{fontSize:10,color,fontFamily:"'JetBrains Mono', monospace",fontWeight:700}}>{value}</span>
      </div>
      <div style={{height:4,background:"var(--surface-alt)",borderRadius:2}}>
        <div style={{height:"100%",width:`${Math.min(100,(value/max)*100)}%`,background:color,borderRadius:2}}/>
      </div>
    </div>
  );
}

function Toast({msg}) {
  return (
    <div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",
      background:"var(--success)",color:"var(--on-accent)",padding:"10px 20px",
      borderRadius:20,fontSize:13,fontWeight:600,zIndex:100,
      boxShadow:"0 4px 16px rgba(43,36,23,0.2)",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:8}}>
      {msg}
    </div>
  );
}

// Lets a roster card's ingredient rolls be corrected in place - no need to open the
// full Add/Edit form - since the desktop grid is built to review/fix many members'
// ingredients back-to-back while testing dish recommendations. Only rendered where
// onUpdateIngredient is supplied (roster-backed views); read-only elsewhere (Compare/Team).
function IngredientQuickEdit({pokemon, speciesData, onUpdateIngredient}) {
  const level = parseInt(pokemon.level) || 0;
  const baseIngredient = speciesData.ingredient0[0]?.ingredient;
  const base = [...new Set(speciesData.ingredient0.map(i=>i.ingredient))].join(", ");
  const slots = [["30", 30, "ingredient30"], ["60", 60, "ingredient60"]];
  return (
    <div style={{marginTop:14}}>
      <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:8,
        letterSpacing:"0.08em"}}>INGREDIENTS{onUpdateIngredient ? " (quick edit)" : ""}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 100px"}}>
          <div style={{fontSize:9,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace",marginBottom:3}}>BASE</div>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"var(--surface-alt)",
            border:"1px solid var(--border)",borderRadius:8,fontSize:11,color:"var(--text-secondary)"}}>
            <IngredientIcon name={baseIngredient} size={15}/> {base}
          </div>
        </div>
        {slots.map(([key, slotLevel, gameKey]) => {
          const locked = level < slotLevel;
          const options = [...new Set(speciesData[gameKey].map(i=>i.ingredient))];
          const value = pokemon.ingredients?.[key] || "";
          if (!onUpdateIngredient) {
            return (
              <div key={key} style={{flex:"1 1 100px"}}>
                <div style={{fontSize:9,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace",marginBottom:3}}>
                  LV.{slotLevel}{locked ? " (locked)" : ""}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"var(--surface-alt)",
                  border:"1px solid var(--border)",borderRadius:8,fontSize:11,color:locked?"var(--text-muted)":"var(--text-secondary)"}}>
                  {!locked && <IngredientIcon name={value} size={14}/>}
                  {locked ? "—" : (value || "unknown")}
                </div>
              </div>
            );
          }
          return (
            <div key={key} style={{flex:"1 1 130px"}}>
              <IngredientPicker label={`Lv.${slotLevel}`} value={value} options={options} locked={locked}
                onChange={v=>onUpdateIngredient(pokemon.id, key, v)}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PokemonCard({pokemon, rank, isWinner, onAddToRoster, inRoster, onRemoveFromRoster, onEdit, onUpdateIngredient, collapsible, role, defaultOpen}) {
  const mods = natureMods(pokemon.nature);
  const helpsPerHour  = Math.round(3600 / freqToSecs(pokemon.frequency) * mods.speed * 10) / 10;
  const subskillScore = scoreSubskills(pokemon.subskills, pokemon.level);
  const mainSkillPwr  = Math.round(scoreMainSkill(pokemon) * mods.skill * 10) / 10;
  const score         = Math.round(totalScore(pokemon) * 10) / 10;
  const rankLabels = ["#1 RECOMMENDED","#2","#3","#4","#5"];
  const nat = GAME?.natures?.[pokemon.nature] || {};
  const speciesData = GAME?.species?.[pokemon.species];
  const [open, setOpen] = useState(!collapsible || !!defaultOpen);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div style={{
      background:isWinner?"var(--accent-soft)":"var(--surface)",
      border:`${isWinner?2:1}px solid ${isWinner?"var(--accent)":"var(--border)"}`,
      borderRadius:"var(--radius-card)",padding:collapsible && !open ? "12px 16px" : 20,
      boxShadow:"var(--shadow-card)",
      position:"relative",marginBottom:collapsible ? 10 : 20}}>

      {rank !== undefined && (
        <div style={{position:"absolute",top:-10,left:16,
          background:rank===0?"var(--accent)":"var(--text-muted)",color:"var(--on-accent)",
          fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20}}>
          {rankLabels[rank]||`#${rank+1}`}
        </div>
      )}
      {role && (
        <div title={pokemon.pickReason || undefined}
          style={{position:"absolute",top:-10,right:16,zIndex:5,
          background:"var(--surface)",border:"1px solid var(--border-strong)",
          fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:20,
          color:"var(--text-primary)",fontFamily:"'JetBrains Mono', monospace",display:"flex",alignItems:"center",gap:4,
          cursor:pokemon.pickReason?"help":"default"}}>
          <Icon name={ROLE_ICONS[role]||"star"} size={11}/> {role}
        </div>
      )}

      <div onClick={collapsible ? ()=>setOpen(o=>!o) : undefined}
        style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        marginTop:rank!==undefined||role?8:0,marginBottom:open?16:0,
        cursor:collapsible?"pointer":"default",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          <PokemonSprite species={pokemon.species} size={collapsible && !open ? 36 : 44} isShiny={pokemon.isShiny}/>
          <div style={{minWidth:0}}>
            <div className="display" style={{fontSize:collapsible && !open ? 15 : 20,fontWeight:700,color:"var(--text-primary)",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pokemon.name}</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
              {pokemon.species} · Lv.{pokemon.level} ·{" "}
              <span style={{color:SPECIALTY_COLOR[pokemon.specialty]||"inherit"}}>{pokemon.specialty}</span>
            </div>
            {open && pokemon.berry && (
              <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace",marginTop:2}}>
                <Icon name="cherries" size={11}/> {pokemon.berry} · {pokemon.mainSkill} {pokemon.mainSkillLevel ? `Lv.${pokemon.mainSkillLevel}` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div>
            <div style={{fontSize:collapsible && !open ? 12 : 14,fontWeight:600,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
              {score}
            </div>
            <div style={{fontSize:9,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace"}}>SCORE</div>
          </div>
          <div>
            <div className="display" style={{fontSize:collapsible && !open ? 15 : 20,fontWeight:700,color:"var(--accent)"}}>
              {(pokemon.rp||0).toLocaleString()}
            </div>
            <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>RP</div>
          </div>
          {collapsible && (
            <Icon name={open?"caret-up":"caret-down"} size={16} style={{color:"var(--text-muted)"}}/>
          )}
        </div>
      </div>

      {open && (
      <React.Fragment>
      <div style={{background:"var(--surface-alt)",borderRadius:10,padding:12,marginBottom:14}}>
        <RadarBar label="HELPS/HR"       value={helpsPerHour}       max={2.5} color="var(--success)"/>
        <RadarBar label="SUBSKILL SCORE" value={subskillScore}      max={12}  color="var(--info)"/>
        <RadarBar label="MAIN SKILL PWR" value={mainSkillPwr} max={7} color="var(--tier-s)"/>
        <RadarBar label="CARRY LIMIT"    value={pokemon.carryLimit||0} max={25} color="var(--text-secondary)"/>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"6px 10px",
        background:"var(--surface-alt)",borderRadius:8,flexWrap:"wrap"}}>
        <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>NATURE</span>
        <span style={{fontSize:12,color:"var(--text-primary)"}}>{pokemon.nature}</span>
        {nat.buff && (
          <span style={{display:"flex",alignItems:"center",gap:2,fontSize:10,color:"var(--success)",marginLeft:"auto"}}>
            <Icon name="arrow-up" size={11}/> {nat.buff}
          </span>
        )}
        {nat.nerf && (
          <span style={{display:"flex",alignItems:"center",gap:2,fontSize:10,color:"var(--danger)"}}>
            <Icon name="arrow-down" size={11}/> {nat.nerf}
          </span>
        )}
        {!nat.buff && !nat.nerf && <span style={{fontSize:10,color:"var(--text-muted)",marginLeft:"auto"}}>neutral</span>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14,
        padding:"6px 10px",background:"var(--surface-alt)",borderRadius:8}}>
        <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>FREQUENCY</span>
        <span style={{fontSize:12,color:"var(--accent)",fontFamily:"'JetBrains Mono', monospace"}}>{pokemon.frequency}</span>
      </div>

      <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:8,
        letterSpacing:"0.08em"}}>SUBSKILLS</div>
      {SLOT_LEVELS.map(lv => {
        const entry = pokemon.subskills?.[lv];
        return entry?.name
          ? <SubskillBadge key={lv} name={entry.name} locked={isSubskillLocked(pokemon.level, lv)} level={lv}/>
          : null;
      })}

      {speciesData && (
        <IngredientQuickEdit pokemon={pokemon} speciesData={speciesData} onUpdateIngredient={onUpdateIngredient}/>
      )}

      <div style={{display:"flex",gap:8,marginTop:14}}>
        {onAddToRoster && !inRoster && (
          <button onClick={()=>onAddToRoster(pokemon)}
            style={{flex:1,padding:"10px",background:"var(--success-bg)",
              border:"1px solid var(--success)",borderRadius:10,color:"var(--success)",
              fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Icon name="plus" size={14}/> ADD TO ROSTER
          </button>
        )}
        {onAddToRoster && inRoster && (
          <div style={{flex:1,padding:"10px",textAlign:"center",
            background:"var(--success-bg)",border:"1px solid var(--border)",
            borderRadius:10,color:"var(--success)",fontSize:12,fontWeight:600,
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Icon name="check" size={14}/> IN YOUR ROSTER
          </div>
        )}
        {onEdit && (
          <button onClick={()=>onEdit(pokemon)}
            style={{flex:1,padding:"10px",background:"var(--info-bg)",
              border:"1px solid var(--info)",borderRadius:10,color:"var(--info)",
              fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Icon name="pencil-simple" size={14}/> EDIT
          </button>
        )}
        {onRemoveFromRoster && (
          <button
            onClick={()=>{
              if (!confirmRemove) {
                setConfirmRemove(true);
                setTimeout(()=>setConfirmRemove(false), 3000);
              } else {
                onRemoveFromRoster(pokemon.id);
              }
            }}
            style={{flex:1,padding:"10px",
              background:confirmRemove?"var(--danger)":"var(--danger-bg)",
              border:"1px solid var(--danger)",borderRadius:10,
              color:confirmRemove?"var(--on-accent)":"var(--danger)",
              fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Icon name="trash" size={14}/> {confirmRemove ? "TAP AGAIN TO REMOVE" : "REMOVE"}
          </button>
        )}
      </div>
      </React.Fragment>
      )}
    </div>
  );
}

// ── Species Autocomplete ──────────────────────────────────────────────────────
function SpeciesInput({value, onSelect}) {
  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value || ""), [value]);

  const matches = text.length >= 1 && GAME
    ? Object.keys(GAME.species).filter(s => s.toLowerCase().startsWith(text.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div style={{position:"relative"}}>
      <div style={{position:"relative"}}>
        <Icon name="magnifying-glass" size={16} style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)"}}/>
        <input value={text} placeholder="e.g. Latios" style={{paddingLeft:36}}
          onChange={e => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}/>
      </div>
      {open && matches.length > 0 && (
        <div className="autocomplete-list">
          {matches.map(s => (
            <div key={s} className="autocomplete-item"
              onClick={() => { onSelect(s); setText(s); setOpen(false); }}>
              <span style={{fontWeight:600}}>{s}</span>
              <span style={{fontSize:10,color:"var(--text-secondary)",marginLeft:8,fontFamily:"'JetBrains Mono', monospace"}}>
                {GAME.species[s].specialty} · {GAME.species[s].berry}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Data Entry Form ───────────────────────────────────────────────────────────
const EMPTY_FORM = {
  species: "", name: "", level: "", rp: "", freqMins: "", freqSecs: "",
  carryLimit: "", nature: "", mainSkill: "", mainSkillLevel: "1",
  sub10: "", sub25: "", sub50: "", sub70: "", sub80: "",
  ing30: "", ing60: "", isShiny: false
};

function AddView({onSave, onCompareAdd, onUndo, editTarget, onDoneEdit}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState("");
  const [sessionCount, setSessionCount] = useState(0);
  const [lastSavedId, setLastSavedId] = useState(null);
  const isEdit = !!editTarget;

  useEffect(() => {
    if (editTarget) {
      const fs = freqToSecs(editTarget.frequency);
      setForm({
        species: editTarget.species || "",
        name: editTarget.name || "",
        level: String(editTarget.level || ""),
        rp: String(editTarget.rp || ""),
        freqMins: String(Math.floor(fs / 60)),
        freqSecs: String(fs % 60),
        carryLimit: String(editTarget.carryLimit || ""),
        nature: editTarget.nature || "",
        mainSkill: editTarget.mainSkill || "",
        mainSkillLevel: String(editTarget.mainSkillLevel || "1"),
        sub10: editTarget.subskills?.[10]?.name || "",
        sub25: editTarget.subskills?.[25]?.name || "",
        sub50: editTarget.subskills?.[50]?.name || "",
        sub70: editTarget.subskills?.[70]?.name || "",
        sub80: editTarget.subskills?.[80]?.name || "",
        ing30: editTarget.ingredients?.["30"] || "",
        ing60: editTarget.ingredients?.["60"] || "",
        isShiny: !!editTarget.isShiny,
      });
    }
  }, [editTarget]);

  function set(k, v) { setForm(prev => ({...prev, [k]: v})); }
  function showToast(m) { setToast(m); setTimeout(()=>setToast(""), 2200); }

  const speciesData = GAME?.species?.[form.species];
  const natureData  = GAME?.natures?.[form.nature];
  const level = parseInt(form.level) || 0;
  const subskillNames = GAME ? Object.keys(GAME.subskills) : [];

  const chosen = [form.sub10, form.sub25, form.sub50, form.sub70, form.sub80].filter(Boolean);

  function buildPokemon() {
    const subskills = {};
    [["sub10",10],["sub25",25],["sub50",50],["sub70",70],["sub80",80]].forEach(([k, lv]) => {
      if (form[k]) subskills[lv] = { name: form[k], locked: level < lv };
    });
    const ingredients = {};
    if (form.ing30) ingredients["30"] = form.ing30;
    if (form.ing60) ingredients["60"] = form.ing60;
    return {
      id: editTarget?.id || makeId(form.name || form.species),
      name: form.name || form.species,
      species: form.species,
      specialty: speciesData?.specialty || "?",
      berry: speciesData?.berry || "?",
      mainSkill: form.mainSkill || speciesData?.mainSkill || "?",
      mainSkillLevel: parseInt(form.mainSkillLevel) || 1,
      level,
      rp: parseInt(form.rp) || 0,
      frequency: `${parseInt(form.freqMins)||0} mins ${parseInt(form.freqSecs)||0} secs`,
      carryLimit: parseInt(form.carryLimit) || 0,
      nature: form.nature,
      subskills,
      ingredients,
      isShiny: !!form.isShiny
    };
  }

  const missing = [];
  if (!form.species) missing.push("species");
  if (!form.level) missing.push("level");
  if (!form.nature) missing.push("nature");
  if (!form.sub10) missing.push("Lv.10 subskill");
  if (!form.sub25) missing.push("Lv.25 subskill");
  const valid = missing.length === 0;

  function handleSave() {
    if (!valid) return;
    const p = buildPokemon();
    onSave(p);
    setLastSavedId(p.id);
    setSessionCount(c => c + 1);
    if (isEdit) { onDoneEdit(); showToast("✓ Pokémon updated"); }
    else { setForm(EMPTY_FORM); showToast("✓ Saved to roster"); }
  }

  function handleUndo() {
    if (!lastSavedId) return;
    onUndo(lastSavedId);
    setLastSavedId(null);
    setSessionCount(c => Math.max(0, c - 1));
    showToast("↩ Last save undone");
  }

  function handleAddCompare() {
    if (!valid) return;
    onCompareAdd(buildPokemon());
    setForm(EMPTY_FORM);
    showToast("✓ Added to comparison");
  }

  function SubSelect({slotKey, slotLevel}) {
    const locked = level > 0 && level < slotLevel;
    return (
      <div className="field" style={{flex:1,minWidth:"46%"}}>
        <label style={{display:"flex",alignItems:"center",gap:4}}>Lv.{slotLevel} {locked && <Icon name="lock" size={10}/>}</label>
        <select value={form[slotKey]} onChange={e=>set(slotKey, e.target.value)}
          style={{opacity: locked ? 0.6 : 1, fontSize:12, padding:"9px 8px"}}>
          <option value="">— empty —</option>
          {subskillNames.map(s => (
            <option key={s} value={s} disabled={chosen.includes(s) && form[slotKey] !== s}>
              [{GAME.subskills[s].tier}] {s}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast msg={toast}/>}
      <div style={{textAlign:"center",padding:"14px 0 18px"}}>
        <div className="display" style={{fontSize:20,fontWeight:600,marginBottom:4}}>
          {isEdit ? "Edit Pokémon" : "Add Pokémon"}
        </div>
        <div style={{fontSize:12,color:"var(--text-secondary)"}}>
          {isEdit ? `Editing ${editTarget.name}` : "Quick data entry with autocomplete"}
        </div>
      </div>

      {!isEdit && sessionCount > 0 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,
          padding:"8px 12px",background:"var(--success-bg)",border:"1px solid var(--success)",
          borderRadius:8,marginBottom:16,fontSize:12,color:"var(--success)",fontFamily:"'JetBrains Mono', monospace"}}>
          <span style={{display:"flex",alignItems:"center",gap:5}}>
            <Icon name="check" size={13}/> {sessionCount} saved this session
          </span>
          {lastSavedId && (
            <button onClick={handleUndo}
              style={{background:"transparent",border:"1px solid var(--success)",borderRadius:14,
                padding:"3px 10px",color:"var(--success)",fontSize:11,fontWeight:600,
                display:"flex",alignItems:"center",gap:4}}>
              <Icon name="arrow-u-up-left" size={12}/> UNDO LAST
            </button>
          )}
        </div>
      )}

      {/* Species */}
      <div className="field">
        <label>Species *</label>
        <SpeciesInput value={form.species}
          onSelect={s => {
            const sp = GAME?.species?.[s] || {};
            setForm(prev => ({...prev, species: s,
              ing30: "", ing60: "", // rolled ingredients are species-specific
              mainSkill: sp.mainSkill || "",
              freqMins: sp.baseFrequency ? String(Math.floor(sp.baseFrequency / 60)) : prev.freqMins,
              freqSecs: sp.baseFrequency ? String(sp.baseFrequency % 60) : prev.freqSecs,
              carryLimit: sp.carryLimitBase ? String(sp.carryLimitBase) : prev.carryLimit}));
          }}/>
        {speciesData && (
          <div style={{marginTop:6,padding:"8px 10px",background:"var(--success-bg)",
            border:"1px solid var(--success)",borderRadius:8,fontSize:11,
            color:"var(--success)",fontFamily:"'JetBrains Mono', monospace"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <Icon name="check" size={12}/> {speciesData.specialty} · <Icon name="cherries" size={12}/> {speciesData.berry}
            </div>
            {speciesData.ingredientPercent != null && (
              <div style={{marginTop:4,color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{display:"flex",alignItems:"center",gap:3}}><Icon name="bowl-food" size={12}/> ing {speciesData.ingredientPercent}%</span>
                <span style={{display:"flex",alignItems:"center",gap:3}}><Icon name="lightning" size={12}/> skill {speciesData.skillPercent}%</span>
                {speciesData.baseFrequency ? <span style={{display:"flex",alignItems:"center",gap:3}}><Icon name="clock" size={12}/> base {Math.floor(speciesData.baseFrequency/60)}m {speciesData.baseFrequency%60}s</span> : ""}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Skill — autofilled from species, but pickable if the game data looks wrong */}
      <div className="field">
        <label>Main Skill</label>
        <select value={form.mainSkill} onChange={e=>set("mainSkill", e.target.value)}>
          <option value="">— select —</option>
          {GAME && Object.keys(GAME.mainSkills).sort().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{marginTop:6,fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
          Auto-filled when you pick a species — change it only if it doesn't match what you see in-game
        </div>
      </div>

      {/* Main Skill Level — critical for comparison weight */}
      <div className="field">
        <label>Main Skill Level (1-7)</label>
        <select value={form.mainSkillLevel} onChange={e=>set("mainSkillLevel", e.target.value)}>
          {[1,2,3,4,5,6,7].map(lv => {
            const skillMax = GAME?.mainSkills?.[form.mainSkill]?.maxLevel || 6;
            return <option key={lv} value={lv} disabled={lv > skillMax}>
              Lv.{lv}{lv > skillMax ? " (not available)" : ""}
            </option>;
          })}
        </select>
        <div style={{marginTop:6,fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",lineHeight:1.5}}>
          Increases with Main Skill Seeds or automatically on evolution
        </div>
      </div>

      {/* Nickname + level */}
      <div style={{display:"flex",gap:10}}>
        <div className="field" style={{flex:2}}>
          <label>Nickname</label>
          <input value={form.name} placeholder="e.g. Pochi" onChange={e=>set("name", e.target.value)}/>
        </div>
        <div className="field" style={{flex:1}}>
          <label>Level *</label>
          <input type="number" inputMode="numeric" value={form.level} placeholder="27"
            onChange={e=>set("level", e.target.value)}/>
        </div>
      </div>

      {/* Shiny toggle */}
      <div className="field">
        <label
          onClick={()=>set("isShiny", !form.isShiny)}
          style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",
            padding:"10px 12px",background:form.isShiny?"var(--tier-s-bg)":"var(--surface)",
            border:`1px solid ${form.isShiny?"var(--tier-s)":"var(--border)"}`,borderRadius:"var(--radius-control)",
            textTransform:"none",fontFamily:"inherit",fontSize:13,color:"var(--text-primary)"}}>
          <input type="checkbox" checked={form.isShiny} onChange={e=>set("isShiny", e.target.checked)}
            style={{width:16,height:16,flexShrink:0}}/>
          <Icon name="sparkle" size={15} style={{color:form.isShiny?"var(--tier-s)":"var(--text-muted)"}}/>
          Is shiny
        </label>
      </div>

      {/* RP + carry */}
      <div style={{display:"flex",gap:10}}>
        <div className="field" style={{flex:1}}>
          <label>RP</label>
          <input type="number" inputMode="numeric" value={form.rp} placeholder="1427"
            onChange={e=>set("rp", e.target.value)}/>
        </div>
        <div className="field" style={{flex:1}}>
          <label>Carry Limit</label>
          <input type="number" inputMode="numeric" value={form.carryLimit} placeholder="19"
            onChange={e=>set("carryLimit", e.target.value)}/>
        </div>
      </div>

      {/* Frequency */}
      <div style={{display:"flex",gap:10}}>
        <div className="field" style={{flex:1}}>
          <label>Frequency — Mins</label>
          <input type="number" inputMode="numeric" value={form.freqMins} placeholder="38"
            onChange={e=>set("freqMins", e.target.value)}/>
        </div>
        <div className="field" style={{flex:1}}>
          <label>Secs</label>
          <input type="number" inputMode="numeric" value={form.freqSecs} placeholder="2"
            onChange={e=>set("freqSecs", e.target.value)}/>
        </div>
      </div>
      <div style={{margin:"-6px 0 10px",fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
        Auto-filled with the species base — adjust it if your Pokémon differs
      </div>

      {/* Nature */}
      <div className="field">
        <label>Nature *</label>
        <select value={form.nature} onChange={e=>set("nature", e.target.value)}>
          <option value="">— select —</option>
          {GAME && Object.keys(GAME.natures).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {natureData && (natureData.buff || natureData.nerf) && (
          <div style={{marginTop:6,display:"flex",gap:12,fontSize:11,fontFamily:"'JetBrains Mono', monospace"}}>
            {natureData.buff && <span style={{display:"flex",alignItems:"center",gap:3,color:"var(--success)"}}><Icon name="arrow-up" size={12}/> {natureData.buff}</span>}
            {natureData.nerf && <span style={{display:"flex",alignItems:"center",gap:3,color:"var(--danger)"}}><Icon name="arrow-down" size={12}/> {natureData.nerf}</span>}
          </div>
        )}
        {natureData && !natureData.buff && !natureData.nerf && (
          <div style={{marginTop:6,fontSize:11,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace"}}>neutral nature</div>
        )}
      </div>

      {/* Subskills */}
      <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",margin:"6px 0 8px",
        letterSpacing:"0.08em"}}>SUBSKILLS (Lv.10 and Lv.25 required)</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        <SubSelect slotKey="sub10" slotLevel={10}/>
        <SubSelect slotKey="sub25" slotLevel={25}/>
        <SubSelect slotKey="sub50" slotLevel={50}/>
        <SubSelect slotKey="sub70" slotLevel={70}/>
        <SubSelect slotKey="sub80" slotLevel={80}/>
      </div>

      {/* Ingredients — which of the species' possible rolls THIS pokemon got.
          Optional: unknown slots fall back to the whole species pool in the
          Team Builder, so leaving these empty is safe, just less precise. */}
      {speciesData && (
        <React.Fragment>
          <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",margin:"14px 0 8px",
            letterSpacing:"0.08em"}}>INGREDIENTS (optional — sharpens dish matching)</div>
          <div style={{display:"flex",gap:10}}>
            <div className="field" style={{flex:1}}>
              <label>Base</label>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"var(--surface-alt)",
                border:"1px solid var(--border)",borderRadius:"var(--radius-control)"}}>
                <IngredientIcon name={speciesData.ingredient0[0]?.ingredient} size={18}/>
                <span style={{fontSize:12,color:"var(--text-secondary)"}}>
                  {[...new Set(speciesData.ingredient0.map(i=>i.ingredient))].join(", ")}
                </span>
              </div>
            </div>
            {[["ing30",30,"ingredient30"],["ing60",60,"ingredient60"]].map(([key, slotLevel, gameKey]) => {
              const locked = level > 0 && level < slotLevel;
              const options = [...new Set(speciesData[gameKey].map(i=>i.ingredient))];
              return (
                <div key={key} style={{flex:1}}>
                  <IngredientPicker label={`Lv.${slotLevel}`} value={form[key]} options={options} locked={locked}
                    onChange={v=>set(key, v)}/>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}

      {/* Actions */}
      <div style={{display:"flex",gap:10,marginTop:16}}>
        {!isEdit && (
          <button onClick={handleAddCompare} disabled={!valid}
            style={{flex:1,padding:13,border:`1px solid ${valid?"var(--accent)":"var(--border)"}`,borderRadius:"var(--radius-control)",fontSize:13,fontWeight:600,
              background:valid?"var(--accent-soft)":"var(--surface-alt)",
              color:valid?"var(--accent-strong)":"var(--text-muted)",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Icon name="sword" size={15}/> COMPARE
          </button>
        )}
        <button onClick={handleSave} disabled={!valid}
          style={{flex:1,padding:13,border:"none",borderRadius:"var(--radius-pill)",fontSize:13,fontWeight:700,
            background:valid?"var(--accent)":"var(--surface-alt)",
            color:valid?"var(--on-accent)":"var(--text-muted)",
            boxShadow:valid?"var(--shadow-card-hover)":"none",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <Icon name={isEdit ? "floppy-disk" : "clipboard-text"} size={15}/>
          {isEdit ? "SAVE CHANGES" : "SAVE TO ROSTER"}
        </button>
      </div>
      {!valid && missing.length > 0 && (
        <div style={{marginTop:8,fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",
          display:"flex",alignItems:"center",gap:5}}>
          <Icon name="info" size={13}/> Missing: {missing.join(", ")}
        </div>
      )}
      {isEdit && (
        <button onClick={onDoneEdit}
          style={{width:"100%",marginTop:10,padding:12,background:"transparent",
            border:"1px solid var(--border)",borderRadius:"var(--radius-control)",color:"var(--text-secondary)",fontSize:13}}>
          Cancel editing
        </button>
      )}
    </div>
  );
}

// ── Compare View ──────────────────────────────────────────────────────────────
function CompareView({compared, onAddToRoster, rosterIds, onClear, onGoAdd}) {
  if (compared.length === 0) return (
    <div style={{textAlign:"center",padding:"60px 20px"}}>
      <Icon name="sword" size={40} style={{color:"var(--text-muted)",marginBottom:16}}/>
      <div className="display" style={{fontSize:18,fontWeight:600,marginBottom:8}}>Nothing to compare yet</div>
      <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:24}}>
        Add Pokémon with "Compare" from the form
      </div>
      <button onClick={onGoAdd}
        style={{padding:"12px 24px",background:"var(--accent)",
          border:"none",borderRadius:"var(--radius-control)",color:"var(--on-accent)",fontSize:13,fontWeight:600,
          display:"inline-flex",alignItems:"center",gap:6}}>
        <Icon name="plus" size={15}/> ADD POKÉMON
      </button>
    </div>
  );

  const sorted = [...compared].sort((a,b) => totalScore(b) - totalScore(a));
  return (
    <div>
      <div style={{background:"var(--accent-soft)",border:"1px solid var(--accent)",
        borderRadius:"var(--radius-control)",padding:"14px 16px",marginBottom:20,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:2}}>RECOMMENDATION</div>
          <div style={{fontSize:16,fontWeight:600,color:"var(--accent-strong)"}}>Invest in {sorted[0]?.name}</div>
        </div>
        <button onClick={onClear}
          style={{background:"var(--danger-bg)",border:"1px solid var(--danger)",
            borderRadius:8,padding:"6px 12px",fontSize:11,color:"var(--danger)",fontFamily:"'JetBrains Mono', monospace"}}>
          CLEAR
        </button>
      </div>
      {sorted.map((p,i) => (
        <PokemonCard key={p.id} pokemon={p} rank={i} isWinner={i===0}
          onAddToRoster={onAddToRoster} inRoster={rosterIds.has(p.id)}/>
      ))}
      <div style={{padding:12,background:"var(--surface-alt)",borderRadius:8,
        fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",lineHeight:1.6}}>
        * Score = unlocked subskills (weighted by slot) ×2 + helps/hour + main-skill power, the last two adjusted by nature · Data v{GAME?.meta?.version}
      </div>
    </div>
  );
}

// ── Roster View ───────────────────────────────────────────────────────────────
const ROSTER_SORTS = {
  score:    { label: "Best overall (score)", cmp: (a,b) => totalScore(b) - totalScore(a) },
  rpDesc:   { label: "RP (highest first)",   cmp: (a,b) => (b.rp||0) - (a.rp||0) },
  rpAsc:    { label: "RP (lowest first)",    cmp: (a,b) => (a.rp||0) - (b.rp||0) },
  nameAsc:  { label: "Name (A-Z)",           cmp: (a,b) => a.name.localeCompare(b.name) },
  nameDesc: { label: "Name (Z-A)",           cmp: (a,b) => b.name.localeCompare(a.name) },
  dex:      { label: "Pokédex number",       cmp: (a,b) => (GAME?.species?.[a.species]?.pokedexNumber||9999) - (GAME?.species?.[b.species]?.pokedexNumber||9999) },
  levelDesc:{ label: "Level (highest first)",cmp: (a,b) => (b.level||0) - (a.level||0) },
  specialty:{ label: "Specialty",            cmp: (a,b) => (a.specialty||"").localeCompare(b.specialty||"") },
};

// Fields that get re-entered/corrected after initial import and commonly go stale:
// level, nature, the two required subskill slots, and the level-gated ingredient
// rolls (only "missing" once the pokemon is actually old enough to have rolled them).
// Drives both the Bulk Edit table's red-cell highlighting and its default
// "missing anything" filter.
function pokemonMissingFields(p) {
  const missing = [];
  const level = parseInt(p.level) || 0;
  if (!level) missing.push("level");
  if (!p.nature) missing.push("nature");
  if (!p.subskills?.[10]?.name) missing.push("sub10");
  if (!p.subskills?.[25]?.name) missing.push("sub25");
  if (level >= 30 && !p.ingredients?.["30"]) missing.push("ing30");
  if (level >= 60 && !p.ingredients?.["60"]) missing.push("ing60");
  return missing;
}

const BULK_EDIT_COLUMNS = ["Pokémon","Level","Nature","Sub Lv.10","Sub Lv.25","Ing Lv.30","Ing Lv.60"];

function BulkEditRow({pokemon, onUpdateField}) {
  const speciesData = GAME?.species?.[pokemon.species];
  const missing = pokemonMissingFields(pokemon);
  const level = parseInt(pokemon.level) || 0;
  const subskillNames = GAME ? Object.keys(GAME.subskills) : [];
  const cell = field => ({padding:"6px 10px",borderBottom:"1px solid var(--border)",
    background: field && missing.includes(field) ? "var(--danger-bg)" : "transparent"});
  const selectStyle = {fontSize:12,padding:"6px 8px"};

  return (
    <tr>
      <td style={{...cell(), minWidth:170}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <PokemonSprite species={pokemon.species} size={26} isShiny={pokemon.isShiny}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",whiteSpace:"nowrap",
              overflow:"hidden",textOverflow:"ellipsis",maxWidth:130}}>{pokemon.name}</div>
            <div style={{fontSize:10,color:"var(--text-muted)"}}>{pokemon.species}</div>
          </div>
        </div>
      </td>
      <td style={{...cell("level"),width:64}}>
        <input type="number" inputMode="numeric" value={pokemon.level||""} style={{...selectStyle,width:"100%"}}
          onChange={e=>onUpdateField(pokemon.id,"level",e.target.value)}/>
      </td>
      <td style={{...cell("nature"),width:112}}>
        <select value={pokemon.nature||""} style={selectStyle} onChange={e=>onUpdateField(pokemon.id,"nature",e.target.value)}>
          <option value="">—</option>
          {GAME && Object.keys(GAME.natures).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={{...cell("sub10"),width:150}}>
        <select value={pokemon.subskills?.[10]?.name||""} style={selectStyle} onChange={e=>onUpdateField(pokemon.id,"sub10",e.target.value)}>
          <option value="">—</option>
          {subskillNames.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{...cell("sub25"),width:150}}>
        <select value={pokemon.subskills?.[25]?.name||""} style={selectStyle} onChange={e=>onUpdateField(pokemon.id,"sub25",e.target.value)}>
          <option value="">—</option>
          {subskillNames.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{...cell("ing30"),width:150}}>
        {speciesData && level >= 30 ? (
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <IngredientIcon name={pokemon.ingredients?.["30"]} size={14}/>
            <select value={pokemon.ingredients?.["30"]||""} style={selectStyle} onChange={e=>onUpdateField(pokemon.id,"ing30",e.target.value)}>
              <option value="">—</option>
              {[...new Set(speciesData.ingredient30.map(i=>i.ingredient))].map(ing => <option key={ing} value={ing}>{ing}</option>)}
            </select>
          </div>
        ) : <Icon name="lock" size={12} style={{color:"var(--text-muted)"}}/>}
      </td>
      <td style={{...cell("ing60"),width:150}}>
        {speciesData && level >= 60 ? (
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <IngredientIcon name={pokemon.ingredients?.["60"]} size={14}/>
            <select value={pokemon.ingredients?.["60"]||""} style={selectStyle} onChange={e=>onUpdateField(pokemon.id,"ing60",e.target.value)}>
              <option value="">—</option>
              {[...new Set(speciesData.ingredient60.map(i=>i.ingredient))].map(ing => <option key={ing} value={ing}>{ing}</option>)}
            </select>
          </div>
        ) : <Icon name="lock" size={12} style={{color:"var(--text-muted)"}}/>}
      </td>
    </tr>
  );
}

// Spreadsheet-style bulk editor: every row stays inline-editable with no expand/collapse,
// so correcting many Pokémon (missing ingredients after a mass import, a leveling pass,
// etc.) is a straight tab-through instead of open-card -> edit -> collapse -> repeat.
function BulkEditTable({roster, onUpdateField}) {
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(true);

  const q = search.trim().toLowerCase();
  const rows = roster
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.species.toLowerCase().includes(q))
    .filter(p => !missingOnly || pokemonMissingFields(p).length > 0)
    .sort((a,b) => pokemonMissingFields(b).length - pokemonMissingFields(a).length || a.name.localeCompare(b.name));

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{flex:"1 1 200px",position:"relative"}}>
          <Icon name="magnifying-glass" size={14} style={{position:"absolute",left:11,top:12,color:"var(--text-muted)"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by name or species" style={{paddingLeft:32}}/>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--text-secondary)",
          cursor:"pointer",whiteSpace:"nowrap",textTransform:"none",fontWeight:400}}>
          <input type="checkbox" checked={missingOnly} onChange={e=>setMissingOnly(e.target.checked)}
            style={{width:16,height:16,flexShrink:0}}/>
          Missing anything only
        </label>
      </div>

      <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:10}}>
        {rows.length} {missingOnly ? "need attention" : "shown"}
      </div>

      {rows.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 20px",color:"var(--text-secondary)",fontSize:13}}>
          {missingOnly
            ? "Nothing missing — every Pokémon has level, nature, subskills, and ingredients filled in."
            : `No Pokémon match "${search}"`}
        </div>
      ) : (
        <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:"var(--radius-card)"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:840}}>
            <thead>
              <tr style={{background:"var(--surface-alt)"}}>
                {BULK_EDIT_COLUMNS.map(h => (
                  <th key={h} style={{position:"sticky",top:0,background:"var(--surface-alt)",textAlign:"left",
                    padding:"10px 10px",fontSize:10,color:"var(--text-secondary)",fontWeight:700,
                    letterSpacing:"0.05em",textTransform:"uppercase",borderBottom:"1px solid var(--border)"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => <BulkEditRow key={p.id} pokemon={p} onUpdateField={onUpdateField}/>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RosterView({roster, onRemove, onEdit, onGoAdd, onExport, onImport, onUpdateIngredient, onUpdateField}) {
  const fileRef = useRef();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [mode, setMode] = useState("cards");

  const filtered = roster.filter(p => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return p.name.toLowerCase().includes(q) || p.species.toLowerCase().includes(q);
  });
  const sorted = [...filtered].sort(ROSTER_SORTS[sortKey].cmp);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>YOUR ROSTER</div>
          <div className="display" style={{fontSize:18,fontWeight:600}}>{roster.length} Pokémon</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
            {["cards","bulk"].map(m => (
              <button key={m} onClick={()=>setMode(m)}
                style={{padding:"8px 12px",border:"none",
                  background:mode===m?"var(--accent-soft)":"transparent",
                  color:mode===m?"var(--accent-strong)":"var(--text-secondary)",
                  fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                <Icon name={m==="cards"?"squares-four":"table"} size={13}/> {m==="cards"?"CARDS":"BULK EDIT"}
              </button>
            ))}
          </div>
          <button onClick={onExport}
            style={{padding:"8px 12px",background:"var(--info-bg)",
              border:"1px solid var(--info)",borderRadius:16,color:"var(--info)",
              fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
            <Icon name="download" size={13}/> EXPORT
          </button>
          <button onClick={()=>fileRef.current?.click()}
            style={{padding:"8px 12px",background:"var(--info-bg)",
              border:"1px solid var(--info)",borderRadius:16,color:"var(--info)",
              fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
            <Icon name="upload" size={13}/> IMPORT
          </button>
          <input ref={fileRef} type="file" accept=".json" style={{display:"none"}}
            onChange={e => {
              const f = e.target.files[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = ev => onImport(ev.target.result);
              r.readAsText(f);
              e.target.value = "";
            }}/>
        </div>
      </div>

      {roster.length > 0 && mode === "bulk" ? (
        <BulkEditTable roster={roster} onUpdateField={onUpdateField}/>
      ) : roster.length === 0 ? (
        <div style={{textAlign:"center",padding:"50px 20px"}}>
          <img src="./icon-header.png" alt="" width={48} height={48}
            style={{borderRadius:"50%",border:"1px solid var(--border)",marginBottom:16}}/>
          <div className="display" style={{fontSize:18,fontWeight:600,marginBottom:8}}>Your roster is empty</div>
          <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:24}}>
            Add your first Pokémon to get started
          </div>
          <button onClick={onGoAdd}
            style={{padding:"12px 24px",background:"var(--accent)",
              border:"none",borderRadius:"var(--radius-control)",color:"var(--on-accent)",fontSize:13,fontWeight:600,
              display:"inline-flex",alignItems:"center",gap:6}}>
            <Icon name="plus" size={15}/> ADD POKÉMON
          </button>
        </div>
      ) : (
        <React.Fragment>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <div style={{flex:1,position:"relative"}}>
              <Icon name="magnifying-glass" size={14} style={{position:"absolute",left:11,top:12,color:"var(--text-muted)"}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search by name or species"
                style={{paddingLeft:32}}/>
            </div>
            <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{width:"auto",flexShrink:0}}>
              {Object.entries(ROSTER_SORTS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {sorted.length === 0 ? (
            <div style={{textAlign:"center",padding:"30px 20px",color:"var(--text-secondary)",fontSize:13}}>
              No Pokémon match "{search}"
            </div>
          ) : (
            <div className="card-grid">
              {sorted.map(p => (
                <PokemonCard key={p.id} pokemon={p} onRemoveFromRoster={onRemove} onEdit={onEdit}
                  onUpdateIngredient={onUpdateIngredient} collapsible/>
              ))}
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

// ── Pokedex View ──────────────────────────────────────────────────────────────
const POKEDEX_FILTERS = { OWNED: "owned", ALL: "all", MISSING: "missing" };

function PokedexView({roster, onRemove, onEdit, onGoAdd, onCompareFromRoster, onUpdateIngredient}) {
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState(POKEDEX_FILTERS.ALL);

  const bySpecies = {};
  roster.forEach(p => { (bySpecies[p.species] = bySpecies[p.species] || []).push(p); });
  const ownedCount = Object.keys(bySpecies).length;

  if (roster.length === 0) return (
    <div style={{textAlign:"center",padding:"50px 20px"}}>
      <img src="./icon-header.png" alt="" width={48} height={48}
        style={{borderRadius:"50%",border:"1px solid var(--border)",marginBottom:16}}/>
      <div className="display" style={{fontSize:18,fontWeight:600,marginBottom:8}}>Your Pokédex is empty</div>
      <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:24}}>
        Every species you own will show up here
      </div>
      <button onClick={onGoAdd}
        style={{padding:"12px 24px",background:"var(--accent)",
          border:"none",borderRadius:"var(--radius-control)",color:"var(--on-accent)",fontSize:13,fontWeight:600,
          display:"inline-flex",alignItems:"center",gap:6}}>
        <Icon name="plus" size={15}/> ADD POKÉMON
      </button>
    </div>
  );

  const allSpecies = Object.keys(GAME.species).sort((a,b) =>
    (GAME.species[a].pokedexNumber||9999) - (GAME.species[b].pokedexNumber||9999));
  const visibleSpecies = allSpecies.filter(sp => {
    if (filter === POKEDEX_FILTERS.OWNED) return !!bySpecies[sp];
    if (filter === POKEDEX_FILTERS.MISSING) return !bySpecies[sp];
    return true;
  });

  const byRegion = {};
  visibleSpecies.forEach(sp => {
    const region = regionFor(GAME.species[sp].pokedexNumber || 0);
    (byRegion[region] = byRegion[region] || []).push(sp);
  });
  const regionOrder = REGIONS.map(r=>r.name).filter(r => byRegion[r]?.length);

  const FILTER_TABS = [
    { key: POKEDEX_FILTERS.OWNED,   label: `Owned (${ownedCount})` },
    { key: POKEDEX_FILTERS.ALL,     label: `All (${allSpecies.length})` },
    { key: POKEDEX_FILTERS.MISSING, label: `Missing (${allSpecies.length - ownedCount})` },
  ];

  return (
    <div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>YOUR POKÉDEX</div>
        <div className="display" style={{fontSize:18,fontWeight:600}}>{ownedCount}/{allSpecies.length} species · {roster.length} Pokémon</div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {FILTER_TABS.map(t => (
          <button key={t.key} onClick={()=>{setFilter(t.key); setExpanded(null);}}
            style={{flex:1,padding:"8px 4px",borderRadius:8,fontSize:11,fontWeight:600,
              border:`1px solid ${filter===t.key?"var(--accent)":"var(--border)"}`,
              background:filter===t.key?"var(--accent-soft)":"var(--surface)",
              color:filter===t.key?"var(--accent-strong)":"var(--text-secondary)"}}>
            {t.label}
          </button>
        ))}
      </div>

      {visibleSpecies.length === 0 ? (
        <div style={{textAlign:"center",padding:"30px 20px",color:"var(--text-secondary)",fontSize:13}}>
          Nothing here — every species is owned!
        </div>
      ) : regionOrder.map(region => (
        <div key={region} style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",
            letterSpacing:"0.08em",marginBottom:8}}>{region.toUpperCase()} · {byRegion[region].length}</div>
          <div className="dex-grid">
            {byRegion[region].map(sp => {
              const owned = bySpecies[sp];
              const isOwned = !!owned;
              const dexNo = GAME?.species?.[sp]?.pokedexNumber;
              const isOpen = expanded === sp;
              return (
                <React.Fragment key={sp}>
                  <div onClick={()=>isOwned && setExpanded(isOpen ? null : sp)}
                    style={{background:isOpen?"var(--accent-soft)":"var(--surface)",
                      border:`1px solid ${isOpen?"var(--accent)":"var(--border)"}`,
                      borderRadius:"var(--radius-control)",padding:"12px 6px 10px",
                      cursor:isOwned?"pointer":"default",opacity:isOwned?1:0.45,
                      display:"flex",flexDirection:"column",alignItems:"center",gap:6,position:"relative"}}>
                    {isOwned && owned.length > 1 && (
                      <div style={{position:"absolute",top:-7,right:-4,background:"var(--accent)",
                        color:"var(--on-accent)",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono', monospace",
                        padding:"2px 7px",borderRadius:20}}>x{owned.length}</div>
                    )}
                    <div style={{filter:isOwned?"none":"grayscale(1)"}}>
                      <PokemonSprite species={sp} size={44} isShiny={isOwned && owned.some(p=>p.isShiny)}/>
                    </div>
                    <div style={{textAlign:"center",minWidth:0,width:"100%"}}>
                      <div style={{fontSize:11,fontWeight:600,color:"var(--text-primary)",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sp}</div>
                      {dexNo && (
                        <div style={{fontSize:9,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace"}}>
                          #{String(dexNo).padStart(3,"0")}
                        </div>
                      )}
                    </div>
                  </div>
                  {isOpen && isOwned && (
                    <div style={{gridColumn:"1 / -1"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        margin:"4px 0 8px"}}>
                        <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",
                          letterSpacing:"0.05em"}}>
                          YOUR {sp.toUpperCase()} ({owned.length})
                        </div>
                        {owned.length >= 2 && onCompareFromRoster && (
                          <button onClick={()=>onCompareFromRoster(owned)}
                            style={{padding:"5px 10px",background:"var(--accent-soft)",
                              border:"1px solid var(--accent)",borderRadius:14,color:"var(--accent-strong)",
                              fontSize:10,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                            <Icon name="sword" size={11}/> COMPARE THESE {owned.length}
                          </button>
                        )}
                      </div>
                      <div className="card-grid">
                        {[...owned].sort((a,b) => totalScore(b) - totalScore(a)).map(p => (
                          <PokemonCard key={p.id} pokemon={p} onRemoveFromRoster={onRemove} onEdit={onEdit}
                            onUpdateIngredient={onUpdateIngredient} collapsible/>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Team Builder ──────────────────────────────────────────────────────────────
const DISH_TYPE_TO_KEY = { "Curries & Stews": "curry", "Salads": "salad", "Desserts & Drinks": "dessert" };

// individualIngredientPool, expertBerryTier, and buildTeam now live in formulas.js
// (destructured from window.Formulas at the top of this file) so they're covered by
// node --test. Nothing UI-specific stayed behind - see formulas.js for the logic and
// its "Greengrass Isle Expert Mode" sourcing note.

const ROLE_ICONS = { "Dish engine":"bowl-food", "Ingredients":"bowl-food", "Cooking support":"lightning",
  "Berries (island)":"cherries", "Berries (main favorite)":"cherries", "Berries (sub favorite)":"cherries",
  "Best available":"star" };

const EMPTY_EXPERT = { mainBerry: "", subBerry1: "", subBerry2: "", randomBonus: "ingredient" };

// PokeAPI item sprites use a plain lowercase "<name>-berry" slug for all 18 berries - no
// name remapping needed (verified against gameData.json's berry list).
function berryIconUrl(name) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name.toLowerCase()}-berry.png`;
}

function BerryIcon({name, size}) {
  const [broken, setBroken] = useState(false);
  const s = size || 20;
  if (!name || broken) return <Icon name="cherries" size={s} style={{color:"var(--text-muted)"}}/>;
  return <img src={berryIconUrl(name)} width={s} height={s} alt="" onError={()=>setBroken(true)}
    style={{objectFit:"contain"}}/>;
}

// Sprite-based picker for Expert Mode's 3 favorite-berry fields - a native <select> can't
// show berry art, and users know berries by look more than by name.
function BerryPicker({label, value, onChange, disabledNames}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",
          background:"var(--surface)",border:`1px solid ${open?"var(--accent)":"var(--border)"}`,
          borderRadius:"var(--radius-control)"}}>
        <BerryIcon name={value} size={20}/>
        <span style={{fontSize:13,color:value?"var(--text-primary)":"var(--text-muted)"}}>{value || "— select —"}</span>
        <Icon name={open?"caret-up":"caret-down"} size={14} style={{marginLeft:"auto",color:"var(--text-muted)"}}/>
      </div>
      {open && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:6,marginTop:8,
          padding:10,background:"var(--surface-alt)",borderRadius:10,border:"1px solid var(--border)"}}>
          {GAME.berries.map(b => {
            const disabled = disabledNames.includes(b.name) && b.name !== value;
            const selected = value === b.name;
            return (
              <div key={b.name} onClick={()=>{ if (disabled) return; onChange(b.name); setOpen(false); }}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"7px 4px",
                  borderRadius:8,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.3:1,
                  background:selected?"var(--accent-soft)":"transparent",
                  border:`1px solid ${selected?"var(--accent)":"transparent"}`}}>
                <BerryIcon name={b.name} size={28}/>
                <span style={{fontSize:9,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>{b.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pokemon Sleep's 19 cooking ingredients are game-specific assets - unlike berries
// (real Pokemon items already hosted on PokeAPI), no open sprite source exists for
// these. Each maps to the closest-fit icon in Phosphor's existing generic set
// (verified present in the library, not guessed) rather than hotlinking a
// wiki's game-art scans of uncertain license.
const INGREDIENT_ICON = {
  "Fancy Apple": "orange",
  "Moomoo Milk": "cow",
  "Greengrass Soybeans": "leaf",
  "Honey": "jar",
  "Bean Sausage": "cooking-pot",
  "Warming Ginger": "flame",
  "Snoozy Tomato": "orange-slice",
  "Fancy Egg": "egg",
  "Pure Oil": "drop",
  "Soft Potato": "carrot",
  "Fiery Herb": "pepper",
  "Greengrass Corn": "grains",
  "Soothing Cacao": "coffee-bean",
  "Rousing Coffee": "coffee",
  "Glossy Avocado": "avocado",
  "Tasty Mushroom": "potted-plant",
  "Large Leek": "plant",
  "Plump Pumpkin": "acorn",
  "Slowpoke Tail": "fish",
};

function IngredientIcon({name, size}) {
  return <Icon name={INGREDIENT_ICON[name] || "bowl-food"} size={size || 20}
    style={{color:name?"var(--accent-strong)":"var(--text-muted)"}}/>;
}

// Sprite-based picker for ingredient slots, same interaction pattern as BerryPicker -
// shows an icon per option instead of relying on players knowing 19 game-specific
// item names by text alone.
function IngredientPicker({label, value, options, onChange, locked}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <label style={{display:"flex",alignItems:"center",gap:4}}>{label} {locked && <Icon name="lock" size={10}/>}</label>
      <div onClick={()=>!locked && setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:locked?"default":"pointer",
          background:"var(--surface)",border:`1px solid ${open?"var(--accent)":"var(--border)"}`,
          borderRadius:"var(--radius-control)",opacity:locked?0.6:1}}>
        <IngredientIcon name={value} size={18}/>
        <span style={{fontSize:12,color:value?"var(--text-primary)":"var(--text-muted)",overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value || "— unknown —"}</span>
        {!locked && <Icon name={open?"caret-up":"caret-down"} size={14} style={{marginLeft:"auto",color:"var(--text-muted)",flexShrink:0}}/>}
      </div>
      {open && !locked && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:6,marginTop:8,
          padding:10,background:"var(--surface-alt)",borderRadius:10,border:"1px solid var(--border)"}}>
          <div onClick={()=>{onChange(""); setOpen(false);}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"7px 4px",
              borderRadius:8,cursor:"pointer",background:!value?"var(--accent-soft)":"transparent",
              border:`1px solid ${!value?"var(--accent)":"transparent"}`}}>
            <IngredientIcon name={null} size={22}/>
            <span style={{fontSize:9,color:"var(--text-secondary)"}}>—</span>
          </div>
          {options.map(ing => {
            const selected = value === ing;
            return (
              <div key={ing} onClick={()=>{onChange(ing); setOpen(false);}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"7px 4px",
                  borderRadius:8,cursor:"pointer",background:selected?"var(--accent-soft)":"transparent",
                  border:`1px solid ${selected?"var(--accent)":"transparent"}`}}>
                <IngredientIcon name={ing} size={22}/>
                <span style={{fontSize:8,color:"var(--text-secondary)",textAlign:"center",lineHeight:1.2}}>{ing}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopDishTeam({recipe, roster, island, expertSettings}) {
  const [open, setOpen] = useState(false);
  const result = open ? buildTeam(roster, island, recipe.name, expertSettings) : null;
  return (
    <div style={{border:"1px solid var(--border)",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"10px 12px",display:"flex",
        justifyContent:"space-between",alignItems:"center",cursor:"pointer",background:"var(--surface-alt)"}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recipe.name}</div>
          <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
            Value {recipe.value} · +{recipe.bonusPercent}% bonus
          </div>
        </div>
        <Icon name={open?"caret-up":"caret-down"} size={16} style={{color:"var(--text-muted)",flexShrink:0}}/>
      </div>
      {open && result && (
        <div style={{padding:"10px 12px"}}>
          <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10}}>
            Needs: {recipe.ingredients.map(i => `${i.ingredient} x${i.amount}`).join(", ")}
          </div>
          {result.missingIngredients.length > 0 && (
            <div style={{marginBottom:10,padding:"8px 10px",background:"var(--tier-s-bg)",
              border:"1px solid var(--tier-s)",borderRadius:8,fontSize:11,color:"var(--tier-s)",
              fontFamily:"'JetBrains Mono', monospace",display:"flex",alignItems:"flex-start",gap:5}}>
              <Icon name="warning" size={13} style={{marginTop:2,flexShrink:0}}/>
              No team member produces: {result.missingIngredients.join(", ")}
            </div>
          )}
          {result.team.map(p => (
            <PokemonCard key={p.id} pokemon={p} role={p.role} collapsible/>
          ))}
        </div>
      )}
    </div>
  );
}

function TopDishesGallery({roster, island, expertSettings}) {
  const [mealType, setMealType] = useState("curry");
  const top = GAME.recipes.filter(r => r.type === mealType).sort((a,b)=>b.value-a.value).slice(0,5);
  return (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:8,
        letterSpacing:"0.05em"}}>TOP DISHES · TAP ONE TO SEE ITS RECOMMENDED TEAM</div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {Object.entries(DISH_TYPE_TO_KEY).map(([label, key]) => (
          <button key={key} onClick={()=>setMealType(key)}
            style={{flex:1,padding:"8px 4px",borderRadius:8,fontSize:11,fontWeight:600,
              border:`1px solid ${mealType===key?"var(--accent)":"var(--border)"}`,
              background:mealType===key?"var(--accent-soft)":"var(--surface)",
              color:mealType===key?"var(--accent-strong)":"var(--text-secondary)"}}>
            {label}
          </button>
        ))}
      </div>
      {top.map(r => (
        <TopDishTeam key={r.name} recipe={r} roster={roster} island={island} expertSettings={expertSettings}/>
      ))}
    </div>
  );
}

function TeamView({roster, onGoAdd}) {
  const [island, setIsland] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [expert, setExpert] = useState(EMPTY_EXPERT);
  const [result, setResult] = useState(null);
  const [bestDishes, setBestDishes] = useState(null);
  const [expandedBest, setExpandedBest] = useState(null);
  const recipe = recipeName ? GAME.recipes.find(r => r.name === recipeName) : null;
  const isExpertIsland = island && GAME.islands[island].expert;
  const expertReady = !isExpertIsland || (expert.mainBerry && expert.subBerry1 && expert.subBerry2);
  const expertConfig = isExpertIsland
    ? { mainBerry: expert.mainBerry, subBerries: [expert.subBerry1, expert.subBerry2], randomBonus: expert.randomBonus }
    : null;

  if (roster.length === 0) return (
    <div style={{textAlign:"center",padding:"60px 20px"}}>
      <Icon name="island" size={40} style={{color:"var(--text-muted)",marginBottom:16}}/>
      <div className="display" style={{fontSize:18,fontWeight:600,marginBottom:8}}>You need Pokémon in your roster</div>
      <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:24}}>
        The Team Builder builds teams from your saved roster
      </div>
      <button onClick={onGoAdd}
        style={{padding:"12px 24px",background:"var(--accent)",
          border:"none",borderRadius:"var(--radius-control)",color:"var(--on-accent)",fontSize:13,fontWeight:600,
          display:"inline-flex",alignItems:"center",gap:6}}>
        <Icon name="plus" size={15}/> ADD POKÉMON
      </button>
    </div>
  );

  return (
    <div>
      <div style={{textAlign:"center",padding:"14px 0 18px"}}>
        <div className="display" style={{fontSize:20,fontWeight:600,marginBottom:4}}>Team Builder</div>
        <div style={{fontSize:12,color:"var(--text-secondary)"}}>Optimal team for the week from your roster</div>
      </div>

      <div className="field">
        <label>Island of the week *</label>
        <select value={island} onChange={e=>{setIsland(e.target.value); setExpert(EMPTY_EXPERT); setResult(null);}}>
          <option value="">— select the island —</option>
          {Object.keys(GAME.islands).map(i => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        {island && !isExpertIsland && (
          <div style={{marginTop:6,padding:"8px 10px",background:"var(--info-bg)",
            border:"1px solid var(--info)",borderRadius:8,fontSize:11,
            color:"var(--info)",fontFamily:"'JetBrains Mono', monospace",display:"flex",alignItems:"center",gap:5}}>
            <Icon name="cherries" size={12}/>
            {GAME.islands[island].berries.includes("all")
              ? "Accepts all berries"
              : "Berries: " + GAME.islands[island].berries.join(", ")}
          </div>
        )}
      </div>

      {isExpertIsland && (
        <div style={{background:"var(--surface-alt)",border:"1px solid var(--border)",
          borderRadius:"var(--radius-control)",padding:"14px 16px",marginBottom:14}}>
          <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
            letterSpacing:"0.05em"}}>THIS WEEK'S SETTINGS (from the in-game island screen)</div>

          <BerryPicker label="Main favorite berry *" value={expert.mainBerry}
            onChange={v=>{setExpert(prev=>({...prev, mainBerry: v})); setResult(null);}}
            disabledNames={[expert.subBerry1, expert.subBerry2]}/>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}>
              <BerryPicker label="Sub favorite 1 *" value={expert.subBerry1}
                onChange={v=>{setExpert(prev=>({...prev, subBerry1: v})); setResult(null);}}
                disabledNames={[expert.mainBerry, expert.subBerry2]}/>
            </div>
            <div style={{flex:1}}>
              <BerryPicker label="Sub favorite 2 *" value={expert.subBerry2}
                onChange={v=>{setExpert(prev=>({...prev, subBerry2: v})); setResult(null);}}
                disabledNames={[expert.mainBerry, expert.subBerry1]}/>
            </div>
          </div>
          <div className="field" style={{marginBottom:0}}>
            <label>Random bonus this week *</label>
            <select value={expert.randomBonus} onChange={e=>{setExpert(prev=>({...prev, randomBonus: e.target.value})); setResult(null);}}>
              <option value="ingredient">Ingredients — extra ingredients from favored berries</option>
              <option value="berry">Berries — favored-berry strength boosted</option>
              <option value="skill">Skills — favored-berry skill chance boosted</option>
            </select>
          </div>
          <div style={{marginTop:10,fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",lineHeight:1.6}}>
            Main favorite: 10% faster help + skill level +1. Sub favorites: normal speed. Neither: 15% slower.
          </div>
        </div>
      )}

      {island && expertReady && (
        <div style={{marginBottom:20}}>
          <button onClick={()=>{ setBestDishes(bestAchievableDish(roster, island, expertConfig).slice(0,3)); setExpandedBest(null); }}
            style={{width:"100%",padding:12,background:"var(--accent-soft)",border:"1px solid var(--accent)",
              borderRadius:"var(--radius-pill)",color:"var(--accent-strong)",fontSize:13,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Icon name="sparkle" size={15}/> FIND MY BEST ACHIEVABLE DISH
          </button>
          {bestDishes && (
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:8,
                letterSpacing:"0.05em"}}>RANKED BY RECIPE VALUE × YOUR ROSTER'S REAL PRODUCTION</div>
              {bestDishes.map((bd, i) => (
                <div key={bd.recipe.name} style={{border:"1px solid var(--border)",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
                  <div onClick={()=>setExpandedBest(expandedBest === i ? null : i)}
                    style={{padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",
                      cursor:"pointer",background:i===0?"var(--accent-soft)":"var(--surface-alt)"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i+1}. {bd.recipe.name}</div>
                      <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
                        ~{bd.achievable.toLocaleString()} achievable · {bd.result.coveragePct}% of {bd.fullValue.toLocaleString()}
                      </div>
                    </div>
                    <Icon name={expandedBest===i?"caret-up":"caret-down"} size={16} style={{color:"var(--text-muted)",flexShrink:0}}/>
                  </div>
                  {expandedBest === i && (
                    <div style={{padding:"10px 12px"}}>
                      {bd.result.warnings.map((w,j) => (
                        <div key={j} style={{display:"flex",alignItems:"flex-start",gap:5,fontSize:11,color:"var(--tier-s)",
                          lineHeight:1.6,fontFamily:"'JetBrains Mono', monospace",marginBottom:4}}>
                          <Icon name="warning" size={12} style={{marginTop:2,flexShrink:0}}/> {w}
                        </div>
                      ))}
                      {bd.result.team.map(p => (
                        <PokemonCard key={p.id} pokemon={p} role={p.role} collapsible/>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {island && expertReady && (
        <TopDishesGallery roster={roster} island={island} expertSettings={expertConfig}/>
      )}

      <div className="field">
        <label>Snorlax dish (optional) — for a specific dish not in the top list above</label>
        <select value={recipeName} onChange={e=>{setRecipeName(e.target.value); setResult(null);}}>
          <option value="">— no specific dish —</option>
          {Object.entries(DISH_TYPE_TO_KEY).map(([label, key]) => (
            <optgroup key={key} label={label}>
              {GAME.recipes.filter(r => r.type === key).sort((a,b)=>b.value-a.value).map(r => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {recipe && (
          <div style={{marginTop:6,padding:"8px 10px",background:"var(--tier-s-bg)",
            border:"1px solid var(--tier-s)",borderRadius:8,fontSize:11,
            color:"var(--tier-s)",fontFamily:"'JetBrains Mono', monospace",display:"flex",alignItems:"center",gap:5}}>
            <Icon name="bowl-food" size={12}/> Needs: {recipe.ingredients.map(i => `${i.ingredient} x${i.amount}`).join(", ")}
          </div>
        )}
      </div>

      <button onClick={()=>setResult(buildTeam(roster, island, recipeName, expertConfig))}
        disabled={!island || !expertReady}
        style={{width:"100%",padding:14,border:"none",borderRadius:"var(--radius-pill)",fontSize:14,fontWeight:700,
          letterSpacing:"0.05em",marginBottom:20,
          background:(island && expertReady)?"var(--accent)":"var(--surface-alt)",
          color:(island && expertReady)?"var(--on-accent)":"var(--text-muted)",
          boxShadow:(island && expertReady)?"var(--shadow-card-hover)":"none",
          display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <Icon name="hammer" size={16}/> BUILD OPTIMAL TEAM
      </button>

      {result && (
        <div>
          {/* Summary */}
          <div style={{background:"var(--surface-alt)",border:"1px solid var(--border)",
            borderRadius:"var(--radius-control)",padding:"14px 16px",marginBottom:16}}>
            <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:6}}>TEAM BALANCE</div>
            <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:12,fontFamily:"'JetBrains Mono', monospace"}}>
              <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--danger)"}}><Icon name="cherries" size={13}/> {result.specialties["Berries"]||0} Berries</span>
              <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--success)"}}><Icon name="bowl-food" size={13}/> {result.specialties["Ingredients"]||0} Ingredients</span>
              <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--info)"}}><Icon name="lightning" size={13}/> {result.specialties["Skills"]||0} Skills</span>
              {result.isExpert ? (
                <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--text-secondary)"}}>
                  <Icon name="island" size={13}/> {result.mainMatches} main / {result.subMatches} sub favorite
                </span>
              ) : (
                <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--text-secondary)"}}><Icon name="island" size={13}/> {result.matches}/5 berry match</span>
              )}
              {result.coveragePct != null && (
                <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--accent-strong)"}}>
                  <Icon name="bowl-food" size={13}/> ~{result.coveragePct}% dish coverage
                </span>
              )}
            </div>
            {result.isExpert && (
              <div style={{marginTop:8,fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>
                This week's bonus: <span style={{color:"var(--accent)"}}>{EXPERT_BONUS_LABELS[result.expertSettings.randomBonus]}</span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div style={{background:"var(--tier-s-bg)",border:"1px solid var(--tier-s)",
              borderRadius:"var(--radius-control)",padding:"12px 14px",marginBottom:16}}>
              {result.warnings.map((w,i) => (
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,fontSize:11,color:"var(--tier-s)",lineHeight:1.7,fontFamily:"'JetBrains Mono', monospace"}}>
                  <Icon name="warning" size={13} style={{marginTop:2,flexShrink:0}}/> {w}
                </div>
              ))}
            </div>
          )}

          {/* Team members - collapsed so all 5 fit on one screen; tap to expand details */}
          <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:8,
            letterSpacing:"0.05em"}}>YOUR TEAM · TAP TO SEE DETAILS</div>
          {result.team.map((p,i) => (
            <div key={p.id} style={{position:"relative"}}>
              <PokemonCard pokemon={p} role={p.role} collapsible/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Weekly Results Board ─────────────────────────────────────────────────────
// Replaces the manual log Omar/Luis/Jeriel have kept by hand since Aug 2024. Own
// localStorage key + its own export/import JSON, same pattern as the roster - each
// device keeps a copy, one person is the scribe (no backend, individual-use decision).
const EMPTY_BOARD = { players: ["Omar", "Luis", "Jeriel"], weeks: [], shinyLog: [], shinyBaseCounts: {} };
const EMPTY_WEEK_FORM = { dateLabel: "", island: "", winners: [], dishType: "", winnerRP: "", closenessMargin: "", note: "" };
const EMPTY_SHINY_FORM = { player: "", species: "", date: "", note: "" };

function weekPoints(week, player) {
  if (!week.winners.includes(player)) return 0;
  return 1 / week.winners.length; // ties split evenly (2-way tie = 0.5 each)
}

function computeStandings(board) {
  return board.players.map(player => {
    const points = board.weeks.reduce((s,w) => s + weekPoints(w, player), 0);
    const wins = board.weeks.filter(w => w.winners.includes(player)).length;
    return { player, points: Math.round(points * 10) / 10, wins };
  }).sort((a,b) => b.points - a.points);
}

// Streaks are computed over weeks in the order they were entered (oldest first is
// assumed to be index 0, matching how the "add week" form appends to the end).
function computeStreaks(board, player) {
  let current = 0, best = 0, running = 0;
  board.weeks.forEach(w => {
    if (w.winners.includes(player)) { running++; best = Math.max(best, running); }
    else running = 0;
  });
  current = running;
  return { current, best };
}

function computeIslandWins(board, player) {
  const counts = {};
  board.weeks.filter(w => w.winners.includes(player)).forEach(w => {
    if (w.island) counts[w.island] = (counts[w.island]||0) + 1;
  });
  return counts;
}

function computeDishCounts(board) {
  const counts = {};
  board.weeks.forEach(w => { if (w.dishType) counts[w.dishType] = (counts[w.dishType]||0) + 1; });
  return counts;
}

function BoardBar({label, value, max, color}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{fontSize:11,color:"var(--text-secondary)"}}>{label}</span>
        <span style={{fontSize:11,color,fontFamily:"'JetBrains Mono', monospace",fontWeight:700}}>{value}</span>
      </div>
      <div style={{height:8,background:"var(--surface-alt)",borderRadius:4}}>
        <div style={{height:"100%",width:`${max>0?Math.min(100,(value/max)*100):0}%`,background:color,borderRadius:4}}/>
      </div>
    </div>
  );
}

function WeekEntryForm({board, onAdd}) {
  const [form, setForm] = useState(EMPTY_WEEK_FORM);
  function set(k,v){ setForm(prev=>({...prev,[k]:v})); }
  function toggleWinner(p) {
    set("winners", form.winners.includes(p) ? form.winners.filter(w=>w!==p) : [...form.winners, p]);
  }
  const valid = form.dateLabel.trim() && form.island && form.winners.length > 0;
  function handleAdd() {
    if (!valid) return;
    onAdd({...form, id: makeId("week"), winnerRP: form.winnerRP ? parseInt(form.winnerRP) : undefined});
    setForm(EMPTY_WEEK_FORM);
  }
  return (
    <div style={{background:"var(--surface-alt)",border:"1px solid var(--border)",
      borderRadius:"var(--radius-control)",padding:"14px 16px",marginBottom:20}}>
      <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
        letterSpacing:"0.05em"}}>LOG THIS WEEK'S RESULT</div>
      <div className="field">
        <label>Week / date range *</label>
        <input value={form.dateLabel} placeholder="e.g. Jul 1 - Jul 7, 2026"
          onChange={e=>set("dateLabel", e.target.value)}/>
      </div>
      <div className="field">
        <label>Island *</label>
        <select value={form.island} onChange={e=>set("island", e.target.value)}>
          <option value="">— select —</option>
          {Object.keys(GAME.islands).map(i => <option key={i} value={i}>{i}</option>)}
          <option value="Mix">Mix</option>
        </select>
      </div>
      <div className="field">
        <label>Winner(s) * — tap all that tied</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {board.players.map(p => (
            <button key={p} onClick={()=>toggleWinner(p)}
              style={{padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:600,
                border:`1px solid ${form.winners.includes(p)?"var(--accent)":"var(--border)"}`,
                background:form.winners.includes(p)?"var(--accent-soft)":"var(--surface)",
                color:form.winners.includes(p)?"var(--accent-strong)":"var(--text-secondary)"}}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div className="field" style={{flex:1}}>
          <label>Dish type</label>
          <select value={form.dishType} onChange={e=>set("dishType", e.target.value)}>
            <option value="">—</option>
            {Object.keys(DISH_TYPE_TO_KEY).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field" style={{flex:1}}>
          <label>Winner RP</label>
          <input type="number" inputMode="numeric" value={form.winnerRP} placeholder="optional"
            onChange={e=>set("winnerRP", e.target.value)}/>
        </div>
      </div>
      <div className="field">
        <label>Closeness margin</label>
        <input value={form.closenessMargin} placeholder="e.g. won by 3,200 RP"
          onChange={e=>set("closenessMargin", e.target.value)}/>
      </div>
      <div className="field" style={{marginBottom:10}}>
        <label>Note</label>
        <input value={form.note} placeholder="optional"
          onChange={e=>set("note", e.target.value)}/>
      </div>
      <button onClick={handleAdd} disabled={!valid}
        style={{width:"100%",padding:12,border:"none",borderRadius:"var(--radius-control)",fontSize:13,fontWeight:600,
          background:valid?"var(--accent)":"var(--surface)",color:valid?"var(--on-accent)":"var(--text-muted)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        <Icon name="medal" size={15}/> LOG WEEK
      </button>
    </div>
  );
}

function ShinyLogForm({board, onAdd}) {
  const [form, setForm] = useState(EMPTY_SHINY_FORM);
  function set(k,v){ setForm(prev=>({...prev,[k]:v})); }
  const valid = form.player && form.species.trim();
  function handleAdd() {
    if (!valid) return;
    onAdd({...form, id: makeId("shiny")});
    setForm(EMPTY_SHINY_FORM);
  }
  return (
    <div style={{background:"var(--surface-alt)",border:"1px solid var(--border)",
      borderRadius:"var(--radius-control)",padding:"14px 16px",marginBottom:16}}>
      <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
        letterSpacing:"0.05em"}}>LOG A SHINY</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        {board.players.map(p => (
          <button key={p} onClick={()=>set("player", p)}
            style={{padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:600,
              border:`1px solid ${form.player===p?"var(--tier-s)":"var(--border)"}`,
              background:form.player===p?"var(--tier-s-bg)":"var(--surface)",
              color:form.player===p?"var(--tier-s)":"var(--text-secondary)"}}>
            {p}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <div className="field" style={{flex:1}}>
          <label>Species</label>
          <input value={form.species} placeholder="e.g. Vaporeon" onChange={e=>set("species", e.target.value)}/>
        </div>
        <div className="field" style={{flex:1}}>
          <label>Date</label>
          <input value={form.date} placeholder="optional" onChange={e=>set("date", e.target.value)}/>
        </div>
      </div>
      <button onClick={handleAdd} disabled={!valid}
        style={{width:"100%",padding:11,border:"none",borderRadius:"var(--radius-control)",fontSize:12,fontWeight:600,
          background:valid?"var(--tier-s)":"var(--surface)",color:valid?"var(--on-accent)":"var(--text-muted)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        <Icon name="sparkle" size={14}/> ADD TO SHINY LOG
      </button>
    </div>
  );
}

function BoardView({board, onAddWeek, onRemoveWeek, onAddShiny, onExport, onImport}) {
  const fileRef = useRef();
  const [tab, setTab] = useState("standings");
  const standings = computeStandings(board);
  const dishCounts = computeDishCounts(board);
  const maxPoints = Math.max(1, ...standings.map(s=>s.points));
  const recentWeeks = [...board.weeks].reverse();

  const TABS = [
    { key: "standings", label: "Standings", icon: "medal" },
    { key: "history",   label: "History",   icon: "list" },
    { key: "shiny",     label: "Shiny Log", icon: "sparkle" },
  ];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>WEEKLY RESULTS BOARD</div>
          <div className="display" style={{fontSize:18,fontWeight:600}}>{board.weeks.length} weeks logged</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onExport}
            style={{padding:"8px 12px",background:"var(--info-bg)",border:"1px solid var(--info)",
              borderRadius:16,color:"var(--info)",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
            <Icon name="download" size={13}/> EXPORT
          </button>
          <button onClick={()=>fileRef.current?.click()}
            style={{padding:"8px 12px",background:"var(--info-bg)",border:"1px solid var(--info)",
              borderRadius:16,color:"var(--info)",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
            <Icon name="upload" size={13}/> IMPORT
          </button>
          <input ref={fileRef} type="file" accept=".json" style={{display:"none"}}
            onChange={e => {
              const f = e.target.files[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = ev => onImport(ev.target.result);
              r.readAsText(f);
              e.target.value = "";
            }}/>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{flex:1,padding:"8px 4px",borderRadius:8,fontSize:11,fontWeight:600,
              border:`1px solid ${tab===t.key?"var(--accent)":"var(--border)"}`,
              background:tab===t.key?"var(--accent-soft)":"var(--surface)",
              color:tab===t.key?"var(--accent-strong)":"var(--text-secondary)",
              display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <Icon name={t.icon} size={13}/> {t.label}
          </button>
        ))}
      </div>

      {tab === "standings" && (
        <React.Fragment>
          <WeekEntryForm board={board} onAdd={onAddWeek}/>

          <div style={{background:"var(--surface)",border:"1px solid var(--border)",
            borderRadius:"var(--radius-card)",padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
              letterSpacing:"0.05em"}}>STANDINGS</div>
            {standings.map((s,i) => (
              <div key={s.player} style={{marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  {i===0 && s.points>0 && <Icon name="medal" size={13} style={{color:"var(--tier-s)"}}/>}
                  <span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)"}}>{s.player}</span>
                  <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginLeft:"auto"}}>
                    {s.points} pts · {s.wins} wins
                  </span>
                </div>
                <div style={{height:8,background:"var(--surface-alt)",borderRadius:4}}>
                  <div style={{height:"100%",width:`${maxPoints>0?(s.points/maxPoints)*100:0}%`,
                    background:i===0?"var(--tier-s)":"var(--accent)",borderRadius:4}}/>
                </div>
              </div>
            ))}
            {standings.every(s=>s.points===0) && (
              <div style={{fontSize:12,color:"var(--text-muted)"}}>No weeks logged yet — add one above</div>
            )}
          </div>

          <div style={{background:"var(--surface)",border:"1px solid var(--border)",
            borderRadius:"var(--radius-card)",padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
              letterSpacing:"0.05em"}}>STREAKS</div>
            {board.players.map(p => {
              const {current, best} = computeStreaks(board, p);
              return (
                <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                  <span style={{fontSize:12,color:"var(--text-primary)"}}>{p}</span>
                  <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",display:"flex",alignItems:"center",gap:10}}>
                    {current > 0 && <span style={{color:"var(--danger)",display:"flex",alignItems:"center",gap:3}}><Icon name="flame" size={12}/> {current} current</span>}
                    <span>best {best}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{background:"var(--surface)",border:"1px solid var(--border)",
            borderRadius:"var(--radius-card)",padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
              letterSpacing:"0.05em"}}>WINS BY ISLAND</div>
            {board.players.map(p => {
              const islandWins = computeIslandWins(board, p);
              const entries = Object.entries(islandWins);
              if (entries.length === 0) return null;
              const max = Math.max(...entries.map(([,v])=>v));
              return (
                <div key={p} style={{marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",marginBottom:4}}>{p}</div>
                  {entries.map(([island,count]) => (
                    <BoardBar key={island} label={island} value={count} max={max} color="var(--info)"/>
                  ))}
                </div>
              );
            })}
            {board.weeks.length === 0 && <div style={{fontSize:12,color:"var(--text-muted)"}}>—</div>}
          </div>

          {Object.keys(dishCounts).length > 0 && (
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",
              borderRadius:"var(--radius-card)",padding:16,marginBottom:16}}>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
                letterSpacing:"0.05em"}}>DISH TYPE COUNTS</div>
              {Object.entries(dishCounts).map(([dish,count]) => (
                <BoardBar key={dish} label={dish} value={count} max={Math.max(...Object.values(dishCounts))} color="var(--success)"/>
              ))}
            </div>
          )}

          {board.weeks.some(w=>w.winnerRP) && (
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",
              borderRadius:"var(--radius-card)",padding:16}}>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",marginBottom:10,
                letterSpacing:"0.05em"}}>RP RECORDS</div>
              {[...board.weeks].filter(w=>w.winnerRP).sort((a,b)=>b.winnerRP-a.winnerRP).slice(0,5).map(w => (
                <div key={w.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",
                  borderBottom:"1px solid var(--border)"}}>
                  <span style={{color:"var(--text-primary)"}}>{w.winners.join(" & ")} · {w.dateLabel}</span>
                  <span style={{color:"var(--accent)",fontFamily:"'JetBrains Mono', monospace",fontWeight:600}}>{w.winnerRP.toLocaleString()} RP</span>
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      )}

      {tab === "history" && (
        <div>
          {recentWeeks.length === 0 ? (
            <div style={{textAlign:"center",padding:"40px 20px",color:"var(--text-secondary)",fontSize:13}}>
              No weeks logged yet
            </div>
          ) : recentWeeks.map(w => (
            <div key={w.id} style={{background:"var(--surface)",border:"1px solid var(--border)",
              borderRadius:"var(--radius-card)",padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)"}}>{w.dateLabel}</div>
                  <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>{w.island}</div>
                </div>
                <button onClick={()=>onRemoveWeek(w.id)}
                  style={{background:"var(--danger-bg)",border:"1px solid var(--danger)",borderRadius:8,
                    padding:"4px 8px",color:"var(--danger)"}}>
                  <Icon name="trash" size={12}/>
                </button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--tier-s)",marginBottom:4}}>
                <Icon name="medal" size={13}/> {w.winners.join(w.winners.length>1 ? " & " : "")}
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",display:"flex",gap:10,flexWrap:"wrap"}}>
                {w.dishType && <span>{w.dishType}</span>}
                {w.winnerRP && <span>{w.winnerRP.toLocaleString()} RP</span>}
                {w.closenessMargin && <span>{w.closenessMargin}</span>}
              </div>
              {w.note && <div style={{fontSize:11,color:"var(--text-muted)",marginTop:4,fontStyle:"italic"}}>{w.note}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === "shiny" && (
        <div>
          <ShinyLogForm board={board} onAdd={onAddShiny}/>
          {board.players.map(p => {
            const entries = board.shinyLog.filter(s => s.player === p);
            const baseCount = board.shinyBaseCounts?.[p] || 0;
            return (
              <div key={p} style={{background:"var(--surface)",border:"1px solid var(--border)",
                borderRadius:"var(--radius-card)",padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)"}}>{p}</span>
                  <span style={{fontSize:12,color:"var(--tier-s)",fontFamily:"'JetBrains Mono', monospace",fontWeight:700,
                    display:"flex",alignItems:"center",gap:4}}>
                    <Icon name="sparkle" size={13}/> {entries.length + baseCount} total
                    {baseCount > 0 && <span style={{color:"var(--text-muted)",fontWeight:400}}>({baseCount} pre-log)</span>}
                  </span>
                </div>
                {entries.length === 0 ? (
                  <div style={{fontSize:11,color:"var(--text-muted)"}}>No logged shinies yet</div>
                ) : entries.map(s => (
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",
                    borderBottom:"1px solid var(--border)"}}>
                    <PokemonSprite species={s.species} size={26} isShiny/>
                    <span style={{fontSize:12,color:"var(--text-primary)",flex:1}}>{s.species}</span>
                    {s.date && <span style={{fontSize:10,color:"var(--text-muted)",fontFamily:"'JetBrains Mono', monospace"}}>{s.date}</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [gameLoaded, setGameLoaded] = useState(false);
  const [gameError, setGameError]   = useState(false);
  const [, forceRerender]           = useState(0);
  const [view, setView]             = useState(VIEWS.ADD);
  const [compared, setCompared]     = useState([]);
  const [editTarget, setEditTarget] = useState(null);
  const [toast, setToast]           = useState("");
  const [navOpen, setNavOpen]       = useState(false);
  const [theme, setTheme]           = useState(() => {
    const saved = localStorage.getItem("pks_theme");
    if (saved) return saved;
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  });
  const [roster, setRoster]         = useState(() => {
    try { return JSON.parse(localStorage.getItem("pks_roster_v2") || "[]"); }
    catch { return []; }
  });
  const [board, setBoard]           = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pks_board_v1"));
      return saved ? {...EMPTY_BOARD, ...saved} : EMPTY_BOARD;
    } catch { return EMPTY_BOARD; }
  });

  // Load game data
  useEffect(() => {
    fetch("./gameData.json")
      .then(r => r.json())
      .then(data => { GAME = data; window.Formulas.setGame(data); setGameLoaded(true); })
      .catch(() => setGameError(true));
    fetch("./species-sprite-ids.json")
      .then(r => r.json())
      .then(data => { SPRITE_IDS = data; forceRerender(v => v+1); })
      .catch(() => { SPRITE_IDS = {}; });
  }, []);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(e => console.log("SW error:", e));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("pks_roster_v2", JSON.stringify(roster));
  }, [roster]);

  useEffect(() => {
    localStorage.setItem("pks_board_v1", JSON.stringify(board));
  }, [board]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pks_theme", theme);
    const meta = document.getElementById("theme-color-meta");
    if (meta) meta.setAttribute("content", theme === "dark" ? "#1B1730" : "#FFF8ED");
  }, [theme]);

  function showToast(m) { setToast(m); setTimeout(()=>setToast(""), 2200); }

  function saveToRoster(pokemon) {
    setRoster(prev => {
      const idx = prev.findIndex(p => p.id === pokemon.id);
      if (idx >= 0) {
        const copy = [...prev]; copy[idx] = pokemon; return copy;
      }
      return [...prev, pokemon];
    });
  }

  function removeFromRoster(id) {
    setRoster(prev => prev.filter(p => p.id !== id));
  }

  // Patches just one pokemon's ingredient roll in place, from the roster card's
  // quick-edit selects - avoids round-tripping through the full Add/Edit form when
  // fixing many members' ingredients back-to-back.
  function updateIngredient(id, slotKey, value) {
    setRoster(prev => prev.map(p => p.id === id
      ? {...p, ingredients: {...p.ingredients, [slotKey]: value}}
      : p));
  }

  // Backing function for the Bulk Edit table - one cell edit patches one pokemon's
  // one field, so 150+ roster members can be corrected row-by-row without ever
  // leaving the table (no per-Pokémon form navigation).
  function updateRosterField(id, field, value) {
    setRoster(prev => prev.map(p => {
      if (p.id !== id) return p;
      switch (field) {
        case "level": return {...p, level: parseInt(value) || 0};
        case "nature": return {...p, nature: value};
        case "sub10": return {...p, subskills: {...p.subskills, 10: value ? {name: value} : undefined}};
        case "sub25": return {...p, subskills: {...p.subskills, 25: value ? {name: value} : undefined}};
        case "ing30": return {...p, ingredients: {...p.ingredients, "30": value}};
        case "ing60": return {...p, ingredients: {...p.ingredients, "60": value}};
        default: return p;
      }
    }));
  }

  function addToCompare(pokemon) {
    setCompared(prev => [...prev, pokemon]);
  }

  function compareFromRoster(pokemonList) {
    setCompared(pokemonList);
    setView(VIEWS.COMPARE);
  }

  function startEdit(pokemon) {
    setEditTarget(pokemon);
    setView(VIEWS.ADD);
  }

  function exportRoster() {
    const blob = new Blob([JSON.stringify(roster, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pks-roster-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Returns null if the entry is safe to import, otherwise a short reason.
  // Anything that would silently break scoring (unknown species/skill/subskill,
  // non-numeric level) gets rejected here instead of corrupting localStorage.
  function invalidReason(p) {
    if (!p || typeof p !== "object") return "not an object";
    if (!GAME.species[p.species]) return "unknown species";
    if (!GAME.mainSkills[p.mainSkill]) return "unknown main skill";
    for (const entry of Object.values(p.subskills || {})) {
      if (entry?.name && !GAME.subskills[entry.name]) return "unknown subskill";
    }
    for (const ing of Object.values(p.ingredients || {})) {
      if (ing && !GAME.ingredients.some(i => i.name === ing)) return "unknown ingredient";
    }
    if (!Number.isFinite(Number(p.level)) || Number(p.level) <= 0) return "bad level";
    if (p.rp != null && !Number.isFinite(Number(p.rp))) return "bad RP";
    return null;
  }

  function importRoster(text) {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error();
      const reasons = {};
      const valid = arr.filter(p => {
        const r = invalidReason(p);
        if (r) { reasons[r] = (reasons[r] || 0) + 1; return false; }
        return true;
      });
      const ids = new Set(roster.map(p => p.id));
      const news = valid.filter(p => !ids.has(p.id));
      const dupes = valid.length - news.length;
      setRoster(prev => [...prev, ...news]);
      const rejected = arr.length - valid.length;
      let msg = `✓ ${news.length} imported`;
      if (dupes > 0) msg += ` · ${dupes} already owned`;
      if (rejected > 0) msg += ` · ${rejected} rejected (${Object.entries(reasons).map(([r,c]) => `${r} x${c}`).join(", ")})`;
      showToast(msg);
    } catch {
      showToast("⚠ Invalid file");
    }
  }

  function addWeek(week) {
    setBoard(prev => ({...prev, weeks: [...prev.weeks, week]}));
    showToast("✓ Week logged");
  }

  function removeWeek(id) {
    setBoard(prev => ({...prev, weeks: prev.weeks.filter(w => w.id !== id)}));
  }

  function addShiny(entry) {
    setBoard(prev => ({...prev, shinyLog: [...prev.shinyLog, entry]}));
    showToast("✓ Shiny logged");
  }

  function exportBoard() {
    const blob = new Blob([JSON.stringify(board, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pks-board-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBoard(text) {
    try {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.weeks) || !Array.isArray(data.players)) throw new Error();
      setBoard({...EMPTY_BOARD, ...data});
      showToast(`✓ Board imported · ${data.weeks.length} weeks`);
    } catch {
      showToast("⚠ Invalid file");
    }
  }

  const rosterIds = new Set(roster.map(p => p.id));

  const NAV = [
    { id: VIEWS.ADD,     label: "Add",      icon: "plus" },
    { id: VIEWS.COMPARE, label: "Compare",  icon: "sword" },
    { id: VIEWS.ROSTER,  label: "Roster",   icon: "clipboard-text" },
    { id: VIEWS.POKEDEX, label: "Pokedex",  icon: "circle-half" },
    { id: VIEWS.TEAM,    label: "Team",     icon: "island" },
    { id: VIEWS.BOARD,   label: "Board",    icon: "medal" },
  ];

  if (gameError) return (
    <div style={{padding:40,textAlign:"center"}}>
      <Icon name="warning" size={40} style={{color:"var(--danger)",marginBottom:16}}/>
      <div style={{fontSize:16,fontWeight:600}}>Error loading game data</div>
      <div style={{fontSize:13,color:"var(--text-secondary)",marginTop:8}}>Make sure gameData.json is in the same folder</div>
    </div>
  );

  if (!gameLoaded) return (
    <div style={{padding:60,textAlign:"center"}}>
      <img src="./icon-header.png" alt="" width={48} height={48}
        style={{borderRadius:"50%",border:"1px solid var(--border)",marginBottom:16}}/>
      <div style={{fontSize:14,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace"}}>Loading game data...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>

      {toast && <Toast msg={toast}/>}

      <div style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",
        padding:"14px 16px",position:"sticky",top:0,zIndex:20,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div className="display" style={{display:"flex",alignItems:"center",gap:8,fontSize:19,fontWeight:700,color:"var(--text-primary)"}}>
            <img src="./icon-header.png" alt="" width={24} height={24}
              style={{borderRadius:"50%",border:"1px solid var(--border)"}}/> DrowsyCraft
          </div>
          <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono', monospace",letterSpacing:"0.1em"}}>
            PWA · OFFLINE READY · v{GAME.meta.version}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setTheme(t => t === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:"50%",
              width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name={theme === "dark" ? "sun" : "moon-stars"} size={17} style={{color:"var(--text-secondary)"}}/>
          </button>
          <button className="hamburger-btn" onClick={()=>setNavOpen(o=>!o)}
            aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen}
            style={{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:"50%",
              width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name={navOpen ? "x" : "list"} size={18} style={{color:"var(--text-secondary)"}}/>
          </button>
        </div>
      </div>

      {navOpen && <div className="app-nav-backdrop" onClick={()=>setNavOpen(false)}/>}

      <div className="app-content">
        {view === VIEWS.ADD && (
          <AddView
            onSave={p => { saveToRoster(p); }}
            onCompareAdd={addToCompare}
            onUndo={removeFromRoster}
            editTarget={editTarget}
            onDoneEdit={() => { setEditTarget(null); setView(VIEWS.ROSTER); }}/>
        )}
        {view === VIEWS.COMPARE && (
          <CompareView compared={compared} onAddToRoster={p => { saveToRoster(p); }}
            rosterIds={rosterIds} onClear={()=>setCompared([])}
            onGoAdd={()=>setView(VIEWS.ADD)}/>
        )}
        {view === VIEWS.ROSTER && (
          <RosterView roster={roster} onRemove={removeFromRoster} onEdit={startEdit}
            onGoAdd={()=>setView(VIEWS.ADD)} onExport={exportRoster} onImport={importRoster}
            onUpdateIngredient={updateIngredient} onUpdateField={updateRosterField}/>
        )}
        {view === VIEWS.POKEDEX && (
          <PokedexView roster={roster} onRemove={removeFromRoster} onEdit={startEdit}
            onGoAdd={()=>setView(VIEWS.ADD)} onCompareFromRoster={compareFromRoster}
            onUpdateIngredient={updateIngredient}/>
        )}
        {view === VIEWS.TEAM && (
          <TeamView roster={roster} onGoAdd={()=>setView(VIEWS.ADD)}/>
        )}
        {view === VIEWS.BOARD && (
          <BoardView board={board} onAddWeek={addWeek} onRemoveWeek={removeWeek}
            onAddShiny={addShiny} onExport={exportBoard} onImport={importBoard}/>
        )}
      </div>

      <div className={`app-nav${navOpen ? " app-nav-open" : ""}`}>
        {NAV.map(n => (
          <button key={n.id} data-active={view===n.id}
            onClick={()=>{ setView(n.id); if (n.id !== VIEWS.ADD) setEditTarget(null); setNavOpen(false); }}
            style={{background:"transparent",border:"none",
              color:view===n.id?"var(--accent)":"var(--text-muted)",
              display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <Icon name={n.icon} size={19}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:"0.05em"}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

ReactDOM.render(<App/>, document.getElementById("root"));
