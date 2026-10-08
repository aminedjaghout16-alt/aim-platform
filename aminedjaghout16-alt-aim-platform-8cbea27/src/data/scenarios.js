/* =========================================================
   AIMFORGE — Scenario catalog
   ⚠️ Only ONE scenario is fully playable ("demo-flick-01").
   The others are declared entries used by list pages so
   the schema and UI are proven — they resolve to a
   placeholder gameplay screen. Add new scenarios by
   pushing into this array; no UI changes required.
   =========================================================
   Schema fields:
     id          — unique kebab-case identifier
     code        — display code, e.g. "SCN.001"
     name        — display name
     category    — CATEGORIES.id
     kind        — "click" | "tracking" | "flick" | ... (engine hint)
     game        — GAMES.id (or "generic")
     duration    — seconds
     baseSize    — pixel radius at difficulty=1
     baseSpeed   — arbitrary unit consumed by engine
     spawnCount  — concurrent targets on screen
     ttl         — target time-to-live in ms (auto miss)
     description — short marketing blurb
     playable    — true if the engine has an implementation
   ========================================================= */

export const SCENARIOS = [
  {
    id: "demo-flick-01",
    code: "SCN.001",
    name: "Flick — First Shot",
    category: "flick",
    kind: "click",
    game: "generic",
    duration: 30,
    baseSize: 34,
    baseSpeed: 0,
    spawnCount: 1,
    ttl: 1200,
    description: "Snap to a single target that pops in a random screen quadrant. Baseline flick reactivity — the demo scenario proving the engine.",
    playable: true
  },
  {
    id: "click-pop-01",
    code: "SCN.002",
    name: "Pop-shot Grid",
    category: "click",
    kind: "click",
    game: "valorant",
    duration: 45,
    baseSize: 28,
    baseSpeed: 0,
    spawnCount: 3,
    ttl: 1400,
    description: "Static grid pop-up targets. Tests click-timing under time pressure.",
    playable: false
  },
  {
    id: "track-smooth-01",
    code: "SCN.003",
    name: "Smooth Tracking",
    category: "tracking",
    kind: "tracking",
    game: "cs2",
    duration: 40,
    baseSize: 40,
    baseSpeed: 220,
    spawnCount: 1,
    ttl: 0,
    description: "Follow a target on a smooth sine path. Measures pursuit accuracy over time.",
    playable: false
  },
  {
    id: "switch-triple-01",
    code: "SCN.004",
    name: "Triple Switch",
    category: "switching",
    kind: "click",
    game: "apex",
    duration: 45,
    baseSize: 30,
    baseSpeed: 0,
    spawnCount: 3,
    ttl: 900,
    description: "Prioritise between three simultaneous targets — reset time is the metric.",
    playable: false
  },
  {
    id: "strafe-counter-01",
    code: "SCN.005",
    name: "Counter-strafe Duel",
    category: "strafe",
    kind: "click",
    game: "cs2",
    duration: 60,
    baseSize: 32,
    baseSpeed: 120,
    spawnCount: 1,
    ttl: 1200,
    description: "Peek-strafe engagements — trains for the CS-style stop-and-shoot rhythm.",
    playable: false
  },
  {
    id: "memory-holds-01",
    code: "SCN.006",
    name: "Pre-aim Holds",
    category: "memory",
    kind: "click",
    game: "valorant",
    duration: 30,
    baseSize: 32,
    baseSpeed: 0,
    spawnCount: 1,
    ttl: 700,
    description: "Common Valorant site holds — pre-aim reaction to targets appearing at known angles.",
    playable: false
  }
];

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

export function getScenario(id) { return SCENARIO_BY_ID[id] || null; }
export function scenariosByCategory(catId) {
  return SCENARIOS.filter(s => s.category === catId);
}
