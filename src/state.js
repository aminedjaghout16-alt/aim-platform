/* =========================================================
   AIMFORGE — Global state store
   Minimal reactive-ish store. Not a framework — just a
   central place for session state that pages can read.
   Later this hooks into Firestore + Auth services.
   ========================================================= */

const KEY = "aimforge:v1";

const defaultState = {
  user: null,                 // { id, handle, tier } when signed in
  settings: {
    sensitivity: 0.42,        // 0.0 – 2.0
    fov: 103,                 // in-game FOV reference
    game: "valorant",
    theme: "obsidian",
    audio: true
  },
  session: {                  // last training run
    scenarioId: null,
    result: null              // ScoreTracker snapshot
  }
};

class Store {
  constructor() {
    this.state = this._load() || structuredClone(defaultState);
    this.listeners = new Set();
  }

  get()  { return this.state; }

  /** Patch a subtree, then persist and notify. */
  set(patch) {
    this.state = deepMerge(this.state, patch);
    this._save();
    this.listeners.forEach(fn => fn(this.state));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset() {
    this.state = structuredClone(defaultState);
    this._save();
    this.listeners.forEach(fn => fn(this.state));
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); }
    catch { /* ignore quota */ }
  }
}

function deepMerge(a, b) {
  if (typeof a !== "object" || a === null) return b;
  if (typeof b !== "object" || b === null) return b;
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const k of Object.keys(b)) {
    out[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

export const store = new Store();
