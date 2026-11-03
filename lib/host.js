/**
 * The `petHost` bridge the pet renderer expects, implemented against the page
 * instead of an Electron window.
 *
 * The native build talked to the main process over IPC: it moved a transparent
 * BrowserWindow, asked macOS for notifications and parked the pet on the window
 * edge. Here the "window" is the frame the pet lives in, so dragging moves the
 * stage inside that frame and the position is remembered as a distance from the
 * bottom-right corner.
 */

import { loadConfig, saveConfig, loadState, saveState, clearState, defaultConfig } from "./store.js";

const STAGE_W = 760;
const STAGE_PET_CENTER = 380;
const STAGE_GROUND = 250;
const MIN_PET_GAP = 40;

function clampNumber(value, lo, hi, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function createHost({ onJump } = {}) {
  const listeners = new Set();
  const configListeners = new Set();
  let config = loadConfig();
  let state = loadState();
  let stagePos = { x: 0, y: 0 };
  let drag = null;
  let saveTimer = null;
  let pet = null;
  let root = null;

  const frame = () => {
    if (!root) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return { left: 0, top: 0, right: w, bottom: h, width: w, height: h };
    }
    const rect = root.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  };

  const bounds = () => pet?.art?.bounds ?? { left: STAGE_PET_CENTER - 44, right: STAGE_PET_CENTER + 44, top: 140, bottom: STAGE_GROUND };

  /** Where the stage must sit so the pet's feet land on its anchored spot. */
  function place(anchor = config.pos) {
    const rect = frame();
    const b = bounds();
    const petCenter = rect.right - clampNumber(anchor?.right, MIN_PET_GAP, Math.max(MIN_PET_GAP, rect.width - MIN_PET_GAP), 150);
    const feet = rect.bottom - clampNumber(anchor?.bottom, -40, Math.max(-40, rect.height - 140), 0);
    stagePos = { x: petCenter - STAGE_PET_CENTER, y: feet - STAGE_GROUND };
    applyStage();
    return stagePos;
  }

  function applyStage() {
    const rect = frame();
    const stage = root.querySelector("#dshpet-stage");
    if (stage) stage.style.transform = `translate3d(${Math.round(stagePos.x - rect.left)}px, ${Math.round(stagePos.y - rect.top)}px, 0)`;
    pet?.setStagePos?.(stagePos.x, stagePos.y);
  }

  function commitAnchor() {
    const rect = frame();
    const b = bounds();
    const petCenter = stagePos.x + STAGE_PET_CENTER;
    const feet = stagePos.y + STAGE_GROUND;
    config = {
      ...config,
      pos: {
        right: Math.round(rect.right - petCenter),
        bottom: Math.round(rect.bottom - feet),
      },
    };
    saveConfig(config);
  }

  function emit(event) {
    for (const listener of listeners) {
      try { listener(event); } catch { /* one bad listener must not break the pet */ }
    }
  }

  function broadcastConfig() {
    for (const listener of configListeners) {
      try { listener(config); } catch { /* ignore */ }
    }
  }

  function flushState() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (state) saveState(state);
  }

  const onDragMove = (event) => {
    if (!drag) return;
    const rect = frame();
    const b = bounds();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const nextX = drag.baseX + dx;
    const nextY = drag.baseY + dy;
    const minX = rect.left + MIN_PET_GAP + (STAGE_PET_CENTER - b.right);
    const maxX = rect.right - MIN_PET_GAP - (b.right - STAGE_PET_CENTER);
    const minY = rect.top + 90 - (b.bottom - STAGE_GROUND);
    const maxY = rect.bottom + 12 - (b.bottom - STAGE_GROUND);
    stagePos = {
      x: Math.max(minX, Math.min(maxX, nextX)),
      y: Math.max(minY, Math.min(maxY, nextY)),
    };
    applyStage();
  };

  const onDragEnd = () => {
    if (!drag) return;
    drag = null;
    window.removeEventListener("pointermove", onDragMove, true);
    window.removeEventListener("pointerup", onDragEnd, true);
    window.removeEventListener("pointercancel", onDragEnd, true);
    commitAnchor();
  };

  const onResize = () => { if (!drag) place(); };

  window.addEventListener("resize", onResize, { passive: true });

  const host = {
    /* ---- petHost contract ------------------------------------------- */
    init: async () => ({ state, config, mode: "desk", clipCss: 300 }),
    save(next) {
      state = next;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushState, 500);
    },
    setConfig(patch) {
      config = {
        ...config,
        ...patch,
        skin: { ...config.skin, ...(patch?.skin && typeof patch.skin === "object" ? patch.skin : {}) },
        pos: { ...config.pos, ...(patch?.pos && typeof patch.pos === "object" ? patch.pos : {}) },
      };
      saveConfig(config);
      broadcastConfig();
      emit({ type: "config", config });
      return config;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    jump(sessionId) {
      try {
        onJump?.(sessionId);
      } catch { /* navigation is best-effort */ }
      emit({ type: "dsh", kind: "jump-result", sessionId });
    },
    notify(notification) {
      if (!config.notify || !notification) return;
      try {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        // eslint-disable-next-line no-new
        new Notification(notification.title || "桌面宠物", { body: notification.body || "", silent: true });
      } catch { /* notifications are optional */ }
    },
    recall() {
      config = { ...config, pos: { ...defaultConfig().pos } };
      saveConfig(config);
      place();
      broadcastConfig();
    },
    reset() {
      clearState();
      config = defaultConfig();
      saveConfig(config);
      broadcastConfig();
      emit({ type: "config", config });
    },
    touch() {
      pet?.life && (pet.life.state.lastInteractionAt = Date.now());
    },
    log(message) {
      try { console.debug("[dsh-desktop-pet]", message); } catch { /* ignore */ }
    },
    dragStart(point) {
      if (!point) return;
      drag = {
        startX: Number(point.offsetX) || 0,
        startY: Number(point.offsetY) || 0,
        baseX: stagePos.x,
        baseY: stagePos.y,
      };
      window.addEventListener("pointermove", onDragMove, true);
      window.addEventListener("pointerup", onDragEnd, true);
      window.addEventListener("pointercancel", onDragEnd, true);
    },
    dragEnd() {
      onDragEnd();
    },

    /* ---- extras used by the shell ----------------------------------- */
    attachRoot(element) {
      root = element;
      place();
    },
    attach(instance) {
      pet = instance;
      place();
    },
    emit,
    getConfig: () => config,
    onConfig(listener) {
      configListeners.add(listener);
      return () => configListeners.delete(listener);
    },
    flush: flushState,
    dispose() {
      flushState();
      window.removeEventListener("resize", onResize);
      onDragEnd();
      listeners.clear();
      configListeners.clear();
    },
  };

  return host;
}
