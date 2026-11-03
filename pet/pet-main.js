import { BrowserWindow, Notification, app, ipcMain, powerMonitor, screen } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 窗口宽 760，宠物在正中，两边透明、点击穿透，留给菜单和面板
const PET_W = 760;
// 窗口比宠物高一截：下面透明、点击穿透，留给右键菜单 / 状态卡 / 设置面板，免得显示不全
const PET_H = 420;
// 桌面模式下宠物脚底在窗口里的高度（跟 art.js 的 DESK_GROUND 对应，含影子）
const DESK_FOOT = 262;
// 趴着时窗口顶边在宠物窗口里的高度（= 窗口顶上要留多少空间）。按宠物大小算：
// 露在边线上的身子约 48 单位 × 大小，再留 40px（气泡放不下时会压在头顶上）。以前写死 190，宠物缩小后
// DSH 窗口稍微往上拖一点就「放不下」被赶到桌面上
const OVERHANG_BASE = 190;
const overhangFor = (size) => {
  const k = Number.isFinite(Number(size)) ? Math.max(0.6, Math.min(2, Number(size))) : 1;
  return Math.round(48 * k + 40);
};
const RIGHT_GAP = 150;
const IDLE_RETURN_MS = 5 * 60_000;
const DESK_MARGIN = 28;

const CH = {
  init: "dsh-pet:init",
  save: "dsh-pet:save",
  interactive: "dsh-pet:interactive",
  modal: "dsh-pet:modal",
  hot: "dsh-pet:hot",
  dragStart: "dsh-pet:drag-start",
  dragEnd: "dsh-pet:drag-end",
  jump: "dsh-pet:jump",
  notify: "dsh-pet:notify",
  setConfig: "dsh-pet:set-config",
  recall: "dsh-pet:recall",
  reset: "dsh-pet:reset",
  touch: "dsh-pet:touch",
  openSettings: "dsh-pet:open-settings",
  log: "dsh-pet:log",
  uiGet: "dsh-pet:ui-get",
  uiSet: "dsh-pet:ui-set",
  uiEvent: "dsh-pet:ui-event",
  uiState: "dsh-pet:ui-state",
  jumpTo: "dsh-pet:jump-to",
  event: "dsh-pet:event",
};

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value), "utf8");
    renameSync(tmp, file);
  } catch {
    /* The pet must never take the host down. */
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Owns the transparent, always-on-top pet window and all of its desktop
 * geometry. When the feature is disabled the renderer is destroyed and every
 * periodic timer is stopped; the remaining IPC guards are one boolean check.
 */
export class DesktopPet {
  constructor(options = {}) {
    this.app = options.app ?? app;
    this.getMainWindow = options.getMainWindow ?? (() => null);
    this.petDir = options.petDir ?? path.dirname(fileURLToPath(import.meta.url));
    this.userData = options.userData ?? this.app.getPath("userData");
    this.baseDir = path.join(this.userData, "pet");
    this.configPath = path.join(this.baseDir, "config.json");
    this.statePath = path.join(this.baseDir, "state.json");
    this.logPath = path.join(this.baseDir, "pet.log");
    this.config = {
      enabled: true,
      character: "whale",
      notify: true,
      hearts: true,
      size: 1,
      skin: { whale: "classic", crab: "classic" },
      desk: null,
      ...readJson(this.configPath, {}),
    };
    this.state = readJson(this.statePath, null);
    this.window = null;
    this.mainWindow = null;
    this.mode = "perch";
    this.attached = new WeakSet();
    this.drag = null;
    this.autoReturnTimer = null;
    this.idleTimer = null;
    this.lastTouch = Date.now();
    this.parkedByUser = false;
    this.locked = false;
    this.lastIdle = -1;
    this.hiddenForApp = false;
    this.writing = false;
    this.writeQueued = null;
    this.debug = Boolean(options.debug);
    this.onJump = options.onJump ?? null;
    this.registered = false;
    this.registerIpc();
    this.registerPower();
    this.app.on("before-quit", () => this.dispose());
    mkdirSync(this.baseDir, { recursive: true });
  }

  log(...args) {
    if (!this.debug) return;
    try {
      appendFileSync(this.logPath, `${new Date().toISOString()} ${args.map(String).join(" ")}\n`);
    } catch { /* ignore */ }
  }

  registerPower() {
    powerMonitor.on("lock-screen", () => {
      this.locked = true;
      this.window?.hide();
    });
    powerMonitor.on("unlock-screen", () => {
      this.locked = false;
      this.syncVisibility();
    });
  }

  registerIpc() {
    if (this.registered) return;
    this.registered = true;
    const fromPet = (event) => this.window !== null && !this.window.isDestroyed() && event.sender === this.window.webContents;
    const fromUi = (event) => {
      const win = this.getMainWindow();
      return win !== undefined && win !== null && !win.isDestroyed() && event.sender === win.webContents;
    };

    ipcMain.handle(CH.init, (event) => {
      if (!fromPet(event)) throw new Error("pet: rejected init");
      return {
        config: this.publicConfig(),
        state: this.state,
        mode: this.mode,
        clipCss: this.mode === "perch" ? this.overhang() : PET_H,
      };
    });

    ipcMain.on(CH.save, (event, state) => {
      if (!fromPet(event)) return;
      this.saveState(state);
    });
    ipcMain.on(CH.interactive, (event, value) => {
      if (!fromPet(event)) return;
      this.setInteractive(Boolean(value));
    });
    ipcMain.on(CH.hot, (event, rects) => {
      if (!fromPet(event) || !Array.isArray(rects)) return;
      this.hotRects = rects.filter((r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite)).slice(0, 12);
    });
    ipcMain.on(CH.modal, (event, value) => {
      if (!fromPet(event)) return;
      this.setModal(Boolean(value));
    });
    ipcMain.on(CH.dragStart, (event) => {
      if (!fromPet(event)) return;
      this.startDrag();
    });
    ipcMain.on(CH.dragEnd, (event) => {
      if (!fromPet(event)) return;
      this.endDrag();
    });
    ipcMain.on(CH.jump, (event, sessionId) => {
      if (!fromPet(event)) return;
      this.jumpToSession(sessionId);
    });
    ipcMain.on(CH.notify, (event, notification) => {
      if (!fromPet(event)) return;
      this.notify(notification);
    });
    ipcMain.handle(CH.setConfig, (event, patch) => {
      if (!fromPet(event) && !fromUi(event)) throw new Error("pet: rejected config");
      this.setConfig(patch);
      return this.publicConfig();
    });
    ipcMain.on(CH.recall, (event) => {
      if (!fromPet(event)) return;
      this.recall();
    });
    ipcMain.handle(CH.reset, (event) => {
      if (!fromPet(event) && !fromUi(event)) throw new Error("pet: rejected reset");
      this.state = null;
      this.saveState(null, true);
      return true;
    });
    ipcMain.on(CH.touch, (event) => {
      if (!fromPet(event)) return;
      this.lastTouch = Date.now();
    });
    ipcMain.on(CH.log, (event, message) => {
      if (!fromPet(event)) return;
      this.log("[renderer]", message);
    });

    ipcMain.handle(CH.uiGet, (event) => {
      if (!fromUi(event)) throw new Error("pet: rejected ui-get");
      return {
        config: this.publicConfig(),
        state: this.state,
        mode: this.mode,
        available: true,
        overlay: this.window !== null && !this.window.isDestroyed(),
      };
    });
    ipcMain.handle(CH.uiSet, (event, patch) => {
      if (!fromUi(event)) throw new Error("pet: rejected ui-set");
      this.setConfig(patch);
      return this.publicConfig();
    });
    ipcMain.on(CH.uiEvent, (event, payload) => {
      if (!fromUi(event)) return;
      this.forwardEvent(payload);
    });
  }

  publicConfig() {
    return {
      enabled: this.config.enabled,
      character: this.config.character,
      notify: this.config.notify,
      hearts: this.config.hearts,
      size: this.config.size ?? 1,
      skin: { whale: "classic", crab: "classic", ...(this.config.skin ?? {}) },
    };
  }

  saveConfig() {
    writeJson(this.configPath, this.config);
  }

  saveState(state, force = false) {
    if (state !== undefined) this.state = state;
    if (this.writing && !force) {
      this.writeQueued = this.state;
      return;
    }
    this.writing = true;
    try {
      writeJson(this.statePath, this.state);
    } finally {
      this.writing = false;
      if (this.writeQueued) {
        const queued = this.writeQueued;
        this.writeQueued = null;
        this.saveState(queued);
      }
    }
  }

  attach(mainWindow) {
    this.mainWindow = mainWindow;
    if (!mainWindow || mainWindow.isDestroyed() || this.attached.has(mainWindow)) {
      if (this.config.enabled && this.window === null) this.start();
      return;
    }
    this.attached.add(mainWindow);
    const sync = () => this.syncGeometry();
    mainWindow.on("move", sync);
    mainWindow.on("resize", sync);
    mainWindow.on("minimize", () => this.onMainMinimized());
    mainWindow.on("restore", () => this.syncGeometry(true));
    mainWindow.on("show", () => this.syncVisibility());
    mainWindow.on("hide", () => this.syncVisibility());
    mainWindow.on("enter-full-screen", sync);
    mainWindow.on("leave-full-screen", sync);
    mainWindow.on("closed", () => {
      this.mainWindow = null;
      this.window?.hide();
    });
    mainWindow.on("focus", () => { this.mainWindowFocused = true; });
    mainWindow.on("blur", () => { this.mainWindowFocused = false; });
    this.start();
  }

  start() {
    if (!this.config.enabled) {
      this.stop();
      return;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.syncGeometry(true);
      return;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.locked) return;
    this.createWindow();
    this.startIdlePoll();
    this.scheduleAutoReturn();
  }

  stop() {
    this.stopIdlePoll();
    clearInterval(this.mouseTimer);
    clearTimeout(this.autoReturnTimer);
    this.autoReturnTimer = null;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  createWindow() {
    const preload = path.join(this.petDir, "pet-preload.cjs");
    const html = path.join(this.petDir, "index.html");
    const win = new BrowserWindow({
      width: PET_W,
      height: PET_H,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      acceptFirstMouse: true,
      roundedCorners: false,
      title: "DSH Pet",
      webPreferences: {
        preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: true,
        devTools: this.debug,
      },
    });
    this.window = win;
    this.applyLevel(win);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    this.startMouseWatch();
    win.setMenuBarVisibility(false);
    // 菜单/面板开着时窗口拿着焦点；点了别处（失焦）就全部收起
    win.on("blur", () => {
      if (!this.modal) return;
      // 刚打开时激活 DSH 会让主窗口抢走焦点，这段时间里把焦点要回来，不算「点了别处」
      if (Date.now() - this.modalAt < 600) {
        setTimeout(() => { if (this.modal && this.window && !this.window.isDestroyed()) this.window.focus(); }, 30);
        return;
      }
      this.dismissModal();
    });
    // 点了别的 App / 桌面：DSH 失去激活，菜单面板一起收起
    if (!this.resignHooked) {
      this.resignHooked = true;
      // macOS：点了别的 App / 桌面
      this.app.on("did-resign-active", () => this.dismissModal());
      // Mac 和 Windows 都有：DSH 自己的别的窗口拿到焦点（点回了主窗口）
      this.app.on("browser-window-focus", (_event, focused) => {
        if (focused !== this.window) this.dismissModal();
      });
    }
    win.webContents.on("did-finish-load", () => {
      this.sendEvent({ type: "mode", mode: this.mode, clipCss: this.mode === "perch" ? this.overhang() : PET_H });
      this.sendEvent({ type: "config", config: this.publicConfig() });
      this.syncGeometry(true);
      this.showWhenReady(0);
    });
    win.webContents.on("render-process-gone", () => {
      this.window = null;
      if (this.config.enabled) setTimeout(() => this.start(), 1200);
    });
    win.loadFile(html).catch((error) => {
      this.log("load failed", error?.stack ?? String(error));
    });
    this.syncGeometry(true);
  }

  showWhenReady(attempt = 0) {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.shouldHide()) {
      if (attempt < 20) setTimeout(() => this.showWhenReady(attempt + 1), 250);
      return;
    }
    this.window.showInactive();
    this.syncGeometry(true);
  }

  shouldHide() {
    if (this.locked) return true;
    const main = this.mainWindow;
    if (!main || main.isDestroyed()) return true;
    if (!main.isVisible() && main.isMinimized()) return false;
    if (!main.isVisible()) return true;
    return false;
  }

  syncVisibility() {
    if (!this.window || this.window.isDestroyed()) return;
    const hide = this.shouldHide();
    if (hide) this.window.hide();
    else this.window.showInactive();
    this.sendEvent({ type: "visibility", visible: !hide });
    this.syncGeometry(true);
  }

  onMainMinimized() {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.mode === "perch") this.toDesk();
    this.window.showInactive();
  }

  isMainUsable() {
    const main = this.mainWindow;
    return Boolean(main && !main.isDestroyed() && main.isVisible() && !main.isMinimized());
  }

  canPerch() {
    const main = this.mainWindow;
    if (!main || main.isDestroyed() || !main.isVisible() || main.isMinimized()) return false;
    if (main.isFullScreen()) return false;
    const bounds = main.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    return bounds.y >= area.y + this.overhang() + 8;
  }

  perchBounds() {
    const main = this.mainWindow.getBounds();
    const display = screen.getDisplayMatching(main);
    const center = clamp(main.x + main.width - RIGHT_GAP, display.workArea.x + 60, display.workArea.x + display.workArea.width - 60);
    const x = Math.round(center - PET_W / 2);
    const y = main.y - this.overhang();
    return { x, y, width: PET_W, height: PET_H };
  }

  deskBounds() {
    const main = this.mainWindow?.getBounds?.() ?? screen.getPrimaryDisplay().workArea;
    const display = screen.getDisplayMatching(main);
    const stored = this.config.desk;
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      const targetDisplay = screen.getDisplayNearestPoint({ x: stored.x + PET_W / 2, y: stored.y + PET_H / 2 });
      const area = targetDisplay.workArea;
      return {
        x: clamp(stored.x, area.x - PET_W / 2 + 60, area.x + area.width - PET_W / 2 - 60),
        y: clamp(stored.y, area.y, area.y + area.height - 60),
        width: PET_W,
        height: PET_H,
      };
    }
    return {
      x: display.workArea.x + display.workArea.width - PET_W / 2 - DESK_MARGIN * 3,
      y: display.workArea.y + display.workArea.height - DESK_FOOT - DESK_MARGIN,
      width: PET_W,
      height: PET_H,
    };
  }

  syncGeometry(force = false) {
    if (!this.window || this.window.isDestroyed() || this.drag) return;
    const main = this.mainWindow;
    if (!main || main.isDestroyed()) return;
    if (main.isMinimized()) {
      if (this.mode !== "desk") this.toDesk();
      return;
    }
    if (!main.isVisible()) return;
    if (!this.window.isVisible() && !this.shouldHide()) this.window.showInactive();
    // If it was forced onto the desktop by a minimized/top-edge window, climb
    // back as soon as the window gives it room again. A deliberate drag sets
    // parkedByUser and is left alone until the five-minute return timer.
    if (this.mode === "desk" && !this.parkedByUser && this.canPerch()) {
      this.returnToPerch(true);
      return;
    }
    if (this.mode === "perch" && !this.canPerch()) {
      this.toDesk();
      return;
    }
    if (this.mode === "perch") {
      const bounds = this.perchBounds();
      const current = this.window.getBounds();
      if (force || Math.abs(current.x - bounds.x) > 0.5 || Math.abs(current.y - bounds.y) > 0.5) {
        this.window.setBounds(bounds, false);
      }
    } else if (this.mode === "desk") {
      // The user parked it; window moves do not disturb it.
      if (force) {
        const bounds = this.deskBounds();
        this.window.setBounds(bounds, false);
      }
    }
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyLevel();
    this.sendEvent({ type: "mode", mode, clipCss: mode === "perch" ? this.overhang() : PET_H });
    if (mode === "perch") this.syncGeometry(true);
    this.scheduleAutoReturn();
  }

  toDesk(animate = false) {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.mode === "desk") return;
    this.mode = "desk";
    this.applyLevel();
    const bounds = this.deskBounds();
    if (animate) this.animateTo(bounds, 520, () => this.sendEvent({ type: "mode", mode: "desk", clipCss: PET_H }));
    else {
      this.window.setBounds(bounds, false);
      this.sendEvent({ type: "mode", mode: "desk", clipCss: PET_H });
    }
    this.scheduleAutoReturn();
  }

  recall() {
    if (!this.window || this.window.isDestroyed()) return;
    if (!this.canPerch()) {
      this.sendEvent({ type: "reminder", text: "窗口上面放不下我…先把窗口挪下来一点。" });
      return;
    }
    this.returnToPerch(true);
  }

  returnToPerch(animated = false) {
    if (!this.window || this.window.isDestroyed() || !this.canPerch()) return;
    clearTimeout(this.autoReturnTimer);
    this.autoReturnTimer = null;
    this.parkedByUser = false;
    const target = this.perchBounds();
    const begin = () => {
      this.mode = "climb";
      this.applyLevel();
      this.sendEvent({ type: "mode", mode: "desk", clipCss: PET_H });
      const finish = () => {
        this.mode = "perch";
        this.applyLevel();
        this.sendEvent({ type: "mode", mode: "perch", clipCss: this.overhang() });
        this.syncGeometry(true);
      };
      if (animated) this.animateTo(target, 620, finish);
      else {
        this.window.setBounds(target, false);
        finish();
      }
    };
    begin();
  }

  animateTo(target, duration, done) {
    if (!this.window || this.window.isDestroyed()) return;
    const start = this.window.getBounds();
    const started = Date.now();
    clearInterval(this.animationTimer);
    this.animationTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) {
        clearInterval(this.animationTimer);
        return;
      }
      const t = clamp((Date.now() - started) / duration, 0, 1);
      const e = easeOutCubic(t);
      this.window.setBounds({
        x: Math.round(start.x + (target.x - start.x) * e),
        y: Math.round(start.y + (target.y - start.y) * e),
        width: PET_W,
        height: PET_H,
      }, false);
      if (t >= 1) {
        clearInterval(this.animationTimer);
        done?.();
      }
    }, 16);
  }

  scheduleAutoReturn() {
    clearTimeout(this.autoReturnTimer);
    this.autoReturnTimer = null;
    if (this.mode !== "desk") return;
    this.autoReturnTimer = setTimeout(() => this.maybeAutoReturn(), IDLE_RETURN_MS);
  }

  maybeAutoReturn() {
    if (this.mode !== "desk") return;
    if (Date.now() - this.lastTouch < IDLE_RETURN_MS - 500) {
      this.scheduleAutoReturn();
      return;
    }
    if (!this.canPerch()) {
      this.scheduleAutoReturn();
      return;
    }
    this.parkedByUser = false;
    this.returnToPerch(true);
    this.sendEvent({ type: "reminder", text: "在外面待够啦，我回窗口上了。" });
  }

  startIdlePoll() {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) return;
      const seconds = powerMonitor.getSystemIdleTime();
      if (Math.abs(seconds - this.lastIdle) >= 5) {
        this.lastIdle = seconds;
        this.sendEvent({ type: "idle", seconds });
      }
    }, 5000);
  }

  stopIdlePoll() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    this.lastIdle = -1;
  }

  /**
   * 层级：趴在 DSH 窗口上时做它的子窗口，跟着 DSH 一起被别的窗口盖住；
   * 被拖到桌面上时才浮在所有窗口上面。
   */
  applyLevel(win = this.window) {
    if (!win || win.isDestroyed()) return;
    const main = this.mainWindow;
    const onMain = (this.mode === "perch" || this.mode === "climb") && main && !main.isDestroyed();
    if (onMain) {
      win.setAlwaysOnTop(false);
      if (win.getParentWindow() !== main) win.setParentWindow(main);
    } else {
      if (win.getParentWindow()) win.setParentWindow(null);
      win.setAlwaysOnTop(true, "floating");
    }
  }

  dismissModal() {
    if (this.modal && Date.now() - this.modalAt > 600) this.sendEvent({ type: "dismiss" });
  }

  overhang() {
    return overhangFor(this.config?.size);
  }

  setModal(open) {
    if (!this.window || this.window.isDestroyed() || this.modal === open) return;
    this.modal = open;
    this.modalAt = Date.now();
    this.window.setFocusable(open);
    if (open) {
      // 宠物窗口不会自己激活 DSH；先把 DSH 激活，窗口才能真正拿到焦点，之后点别处才会失焦
      try { this.app.focus({ steal: true }); } catch { /* older electron */ }
      this.window.focus();
    }
  }

  setInteractive(interactive) {
    this.rendererWants = interactive;
    this.applyMouse();
  }

  /**
   * 点击穿透开关。不能只靠 forward 转发的鼠标移动：趴窗时宠物是 DSH 的子窗口，
   * macOS 上子窗口收不到转发事件，整只宠物就点不到。所以主进程自己每 80ms 看一次光标，
   * 落在宠物/气泡/面板（页面报上来的 hotRects）上就接住鼠标。
   */
  applyMouse() {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    let over = false;
    if (this.hotRects?.length) {
      const c = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const x = c.x - b.x;
      const y = c.y - b.y;
      over = this.hotRects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    }
    const on = Boolean(over || this.rendererWants || this.modal || this.drag);
    if (on === this.mouseOn) return;
    this.mouseOn = on;
    win.setIgnoreMouseEvents(!on, { forward: true });
  }

  startMouseWatch() {
    clearInterval(this.mouseTimer);
    this.mouseOn = null;
    this.mouseTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) { clearInterval(this.mouseTimer); return; }
      if (this.window.isVisible()) this.applyMouse();
    }, 80);
  }

  startDrag() {
    if (!this.window || this.window.isDestroyed()) return;
    this.lastTouch = Date.now();
    const cursor = screen.getCursorScreenPoint();
    const bounds = this.window.getBounds();
    this.drag = {
      offsetX: cursor.x - bounds.x,
      offsetY: cursor.y - bounds.y,
      started: Date.now(),
    };
    this.sendEvent({ type: "mode", mode: "drag", clipCss: PET_H });
    this.mouseOn = null;
    this.applyMouse();
    this.window.setParentWindow(null);
    this.window.setAlwaysOnTop(true, "screen-saver");
    clearInterval(this.dragTimer);
    this.dragTimer = setInterval(() => {
      if (!this.drag || !this.window || this.window.isDestroyed()) return;
      const point = screen.getCursorScreenPoint();
      // 只挪位置不改大小：setBounds 带尺寸在跨屏/缩放时会把窗口拉伸，拖动时宠物就变形了
      this.window.setPosition(Math.round(point.x - this.drag.offsetX), Math.round(point.y - this.drag.offsetY), false);
    }, 16);
    clearTimeout(this.autoReturnTimer);
  }

  endDrag() {
    if (!this.window || this.window.isDestroyed()) return;
    clearInterval(this.dragTimer);
    this.drag = null;
    this.lastTouch = Date.now();
    const bounds = this.window.getBounds();
    const main = this.mainWindow;
    const nearMainTop = main && !main.isDestroyed()
      && Math.abs(bounds.y + this.overhang() - main.getBounds().y) < 110
      && bounds.x + PET_W / 2 > main.getBounds().x - 120
      && bounds.x + PET_W / 2 < main.getBounds().x + main.getBounds().width + 120;
    if (nearMainTop && this.canPerch()) {
      this.parkedByUser = false;
      this.mode = "perch";
      this.applyLevel();
      const target = this.perchBounds();
      this.animateTo(target, 240, () => this.sendEvent({ type: "mode", mode: "perch", clipCss: this.overhang() }));
    } else {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const area = display.workArea;
      const x = clamp(bounds.x, area.x - PET_W / 2 + 60, area.x + area.width - PET_W / 2 - 60);
      const y = clamp(bounds.y, area.y, area.y + area.height - 80);
      this.config.desk = { x, y };
      this.saveConfig();
      this.window.setBounds({ x, y, width: PET_W, height: PET_H }, false);
      this.mode = "desk";
      this.applyLevel();
      this.parkedByUser = true;
      this.sendEvent({ type: "mode", mode: "desk", clipCss: PET_H });
      this.scheduleAutoReturn();
    }
  }

  setConfig(patch) {
    if (!patch || typeof patch !== "object") return;
    const previous = this.config.enabled;
    for (const key of ["enabled", "character", "notify", "hearts", "size", "skin"]) {
      if (patch[key] !== undefined) this.config[key] = patch[key];
    }
    if (this.config.character !== "crab") this.config.character = "whale";
    this.saveConfig();
    if (patch.size !== undefined && this.window && !this.window.isDestroyed()) {
      if (this.mode === "perch") {
        if (this.canPerch()) {
          this.sendEvent({ type: "mode", mode: "perch", clipCss: this.overhang() });
          this.syncGeometry(true);
        } else this.toDesk();
      } else if (this.mode === "desk" && !this.parkedByUser && this.canPerch()) this.returnToPerch(true);
    }
    if (this.config.enabled !== previous) {
      if (this.config.enabled) this.start();
      else this.stop();
    } else if (this.config.enabled) {
      if (!this.window || this.window.isDestroyed()) this.start();
      else this.sendEvent({ type: "config", config: this.publicConfig() });
    }
    this.notifyUi();
  }

  forwardEvent(payload) {
    if (!payload || typeof payload !== "object" || typeof payload.kind !== "string") return;
    // 在 DSH 主窗口里按下鼠标 = 点了宠物菜单外面
    if (payload.kind === "outside") {
      this.dismissModal();
      return;
    }
    // DSH events are only relevant while the feature is on; one check otherwise.
    if (!this.config.enabled) return;
    if (payload.kind === "tokens" && (!Number.isFinite(payload.tokens) || payload.tokens < 0)) return;
    // 设置页的「重置数据」
    if (payload.kind === "reset") {
      this.sendEvent({ type: "reset" });
      return;
    }
    this.sendEvent({ type: "dsh", ...payload });
    if (payload.kind === "working" || payload.kind === "waiting") this.lastTouch = Date.now();
    this.notifyUi();
  }

  sendEvent(event) {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(CH.event, event);
  }

  notifyUi() {
    const main = this.getMainWindow();
    if (!main || main.isDestroyed()) return;
    main.webContents.send(CH.uiState, {
      config: this.publicConfig(),
      state: this.state,
      mode: this.mode,
      overlay: this.window !== null && !this.window.isDestroyed(),
    });
  }

  jumpToSession(sessionId) {
    const main = this.getMainWindow();
    if (!main || main.isDestroyed()) return;
    if (main.isMinimized()) main.restore();
    if (!main.isVisible()) main.show();
    try { this.app.focus({ steal: true }); } catch { /* older electron */ }
    main.show();
    main.focus();
    this.onJump?.({ sessionId: sessionId ?? null, at: Date.now() });
    main.webContents.send(CH.jumpTo, sessionId ?? null);
  }

  notify(payload) {
    if (!this.config.notify) return;
    if (!payload || typeof payload.title !== "string") return;
    if (!Notification.isSupported()) return;
    try {
      new Notification({
        title: payload.title,
        body: String(payload.body ?? ""),
        silent: false,
      }).show();
    } catch { /* ignore */ }
  }

  dispose() {
    this.stop();
    clearInterval(this.dragTimer);
    clearInterval(this.animationTimer);
    this.drag = null;
  }
}

export const PET_IPC = CH;
export const PET_METRICS = { PET_W, PET_H, OVERHANG_BASE, RIGHT_GAP };
