/**
 * Persistence for the in-page pet.
 *
 * The native build kept `state.json` / `config.json` next to the app's user
 * data; a community plugin only owns its slot in the page, so the same two
 * documents live in localStorage. Nothing leaves the browser.
 */

import { DEFAULT_CONFIG } from "./pet/state.js";

const STATE_KEY = "dsh-desktop-pet:state:v1";
const CONFIG_KEY = "dsh-desktop-pet:config:v1";

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or blocked storage must not break the pet */
  }
}

export function defaultConfig() {
  return { ...DEFAULT_CONFIG, pos: { right: 190, bottom: 0 } };
}

export function loadConfig() {
  const saved = readJson(CONFIG_KEY);
  const base = defaultConfig();
  if (!saved || typeof saved !== "object") return base;
  return {
    ...base,
    ...saved,
    skin: { ...base.skin, ...(saved.skin && typeof saved.skin === "object" ? saved.skin : {}) },
    pos: { ...base.pos, ...(saved.pos && typeof saved.pos === "object" ? saved.pos : {}) },
  };
}

export function saveConfig(config) {
  writeJson(CONFIG_KEY, config);
}

export function loadState() {
  const saved = readJson(STATE_KEY);
  return saved && typeof saved === "object" ? saved : null;
}

export function saveState(state) {
  writeJson(STATE_KEY, state);
}

export function clearState() {
  try {
    window.localStorage.removeItem(STATE_KEY);
    window.localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}
