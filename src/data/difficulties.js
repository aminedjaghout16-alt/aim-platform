/* =========================================================
   AIMFORGE — Difficulty presets
   Modifiers applied on top of a scenario's base parameters.
   Multipliers are consumed by the training engine.
   ========================================================= */

export const DIFFICULTIES = {
  rookie:   { id: "rookie",   code: "T-01", name: "Rookie",   sizeMult: 1.40, speedMult: 0.75, ttlMult: 1.30 },
  agent:    { id: "agent",    code: "T-02", name: "Agent",    sizeMult: 1.15, speedMult: 0.90, ttlMult: 1.10 },
  operator: { id: "operator", code: "T-03", name: "Operator", sizeMult: 1.00, speedMult: 1.00, ttlMult: 1.00 },
  ghost:    { id: "ghost",    code: "T-04", name: "Ghost",    sizeMult: 0.80, speedMult: 1.15, ttlMult: 0.85 },
  ascendant:{ id: "ascendant",code: "T-05", name: "Ascendant",sizeMult: 0.65, speedMult: 1.35, ttlMult: 0.70 }
};

export const DIFFICULTY_LIST = Object.values(DIFFICULTIES);
export const DEFAULT_DIFFICULTY = "operator";
