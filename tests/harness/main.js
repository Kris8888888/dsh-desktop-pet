import { app, BrowserWindow } from "electron";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const petEntry = fs.existsSync(path.join(__dirname, "..", "pet", "pet-main.js"))
  ? new URL("../pet/pet-main.js", import.meta.url)
  : new URL("../../pet/pet-main.js", import.meta.url);
const { DesktopPet } = await import(petEntry.href);
const userData = path.join(os.tmpdir(), "dsh-pet-harness-userdata");
app.setPath("userData", userData);

let mainWindow = null;
let pet = null;
let lastJump = null;
let lastError = null;

process.on("uncaughtException", (error) => {
  lastError = String(error?.stack ?? error);
  console.error("[harness] uncaught", error);
});

function createMain() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    x: 180,
    y: 260,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: "#fbfaf7",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.on("closed", () => { mainWindow = null; });
  return win;
}

app.whenReady().then(() => {
  mainWindow = createMain();
  pet = new DesktopPet({
    getMainWindow: () => mainWindow,
    petDir: fs.existsSync(path.join(__dirname, "..", "pet", "index.html"))
      ? path.join(__dirname, "..", "pet")
      : path.join(__dirname, "..", "..", "pet"),
    debug: true,
    onJump: (sessionId) => { lastJump = { sessionId, at: Date.now() }; },
  });
  pet.attach(mainWindow);
  startServer();
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMain();
      pet.attach(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function petEval(code) {
  if (!pet?.window || pet.window.isDestroyed()) return null;
  try {
    return await pet.window.webContents.executeJavaScript(code, true);
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

async function snapshot() {
  const bounds = (win) => (win && !win.isDestroyed() ? win.getBounds() : null);
  const live = await petEval(`(() => {
    if (!window.__pet) return null;
    const app = window.__pet;
    return {
      fps: app.runtime.fps,
      drawMs: app.runtime.drawMs,
      pose: app.currentPose(Date.now()),
      mode: app.mode,
      clipCss: app.clipCss,
      character: app.life?.state?.character,
      hunger: app.life?.state?.hunger,
      mood: app.life?.state?.mood,
      energy: app.life?.state?.energy,
      health: app.life?.state?.health,
      intimacy: app.life?.state?.intimacy,
      sick: app.life?.state?.sick,
      sleeping: app.life?.state?.sleeping,
      travel: app.life?.state?.travel,
      postcard: app.life?.state?.postcard,
      snacks: app.life?.state?.snacks,
      totals: app.life?.state?.totals,
      today: app.life?.state?.today,
      diary: app.life?.state?.diary,
      bubble: document.getElementById("bubble")?.hidden ? null : document.getElementById("bubble")?.querySelector(".bubble-text")?.textContent,
      cardOpen: app.runtime.cardOpen,
      menuOpen: app.runtime.menuOpen,
      postcardOpen: app.runtime.postcardOpen,
      travelNote: app.runtime.travelNoteEl && !app.runtime.travelNoteEl.hidden,
      settingsOpen: app.runtime.settingsOpen,
      diaryOpen: app.runtime.diaryOpen,
      interactive: app.interactive,
      particles: app.runtime.particles.length,
    };
  })()`);
  const petWin = pet?.window;
  return {
    main: bounds(mainWindow),
    pet: bounds(petWin),
    petWindow: petWin && !petWin.isDestroyed() ? {
      visible: petWin.isVisible(),
      alwaysOnTop: petWin.isAlwaysOnTop(),
      opacity: petWin.getOpacity(),
      focused: petWin.isFocused(),
    } : null,
    mode: pet?.mode,
    config: pet?.publicConfig(),
    state: pet?.state ?? null,
    live,
    lastJump,
    lastError,
    focus: {
      main: mainWindow?.isFocused?.() ?? false,
      app: app.isReady(),
    },
  };
}

function json(res, code, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "access-control-allow-origin": "*",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function sendMouse(type, x, y, extra = {}) {
  const win = pet?.window;
  if (!win || win.isDestroyed()) return false;
  win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), ...extra });
  return true;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/state") {
        json(res, 200, await snapshot());
        return;
      }
      if (req.method !== "POST" || req.url !== "/control") {
        json(res, 404, { error: "not found" });
        return;
      }
      const body = await readBody(req);
      const action = body.action;
      let result = null;
      switch (action) {
        case "event":
          pet?.forwardEvent(body.payload);
          result = { ok: true };
          break;
        case "config":
          pet?.setConfig(body.patch ?? body.payload ?? {});
          result = { ok: true, config: pet?.publicConfig() };
          break;
        case "bounds":
          mainWindow?.setBounds(body.bounds);
          result = { ok: true, bounds: mainWindow?.getBounds() };
          break;
        case "move":
          mainWindow?.setPosition(body.x, body.y, false);
          result = { ok: true, bounds: mainWindow?.getBounds() };
          break;
        case "size":
          mainWindow?.setSize(body.width, body.height, false);
          result = { ok: true, bounds: mainWindow?.getBounds() };
          break;
        case "minimize":
          mainWindow?.minimize();
          result = { ok: true };
          break;
        case "restore":
          mainWindow?.restore();
          result = { ok: true };
          break;
        case "hide-main":
          mainWindow?.hide();
          result = { ok: true };
          break;
        case "show-main":
          mainWindow?.show();
          result = { ok: true };
          break;
        case "mouse":
          sendMouse("mouseMove", body.x, body.y);
          result = { ok: true };
          break;
        case "click":
          sendMouse("mouseMove", body.x, body.y);
          sendMouse("mouseDown", body.x, body.y, { button: body.button ?? "left", clickCount: 1 });
          sendMouse("mouseUp", body.x, body.y, { button: body.button ?? "left", clickCount: 1 });
          result = { ok: true };
          break;
        case "dblclick":
          sendMouse("mouseMove", body.x, body.y);
          sendMouse("mouseDown", body.x, body.y, { button: "left", clickCount: 1 });
          sendMouse("mouseUp", body.x, body.y, { button: "left", clickCount: 1 });
          setTimeout(() => {
            sendMouse("mouseDown", body.x, body.y, { button: "left", clickCount: 2 });
            sendMouse("mouseUp", body.x, body.y, { button: "left", clickCount: 2 });
          }, 90);
          result = { ok: true };
          break;
        case "rightclick":
          sendMouse("mouseMove", body.x, body.y);
          sendMouse("mouseDown", body.x, body.y, { button: "right", clickCount: 1 });
          sendMouse("mouseUp", body.x, body.y, { button: "right", clickCount: 1 });
          result = { ok: true };
          break;
        case "stroke": {
          const points = body.points ?? [];
          if (body.down && points[0]) sendMouse("mouseDown", points[0].x, points[0].y, { button: "left", clickCount: 1 });
          points.forEach((point, index) => {
            setTimeout(() => sendMouse("mouseMove", point.x, point.y), index * 40);
          });
          if (body.up && points.length) {
            const last = points[points.length - 1];
            setTimeout(() => sendMouse("mouseUp", last.x, last.y, { button: "left", clickCount: 1 }), points.length * 40 + 40);
          }
          result = { ok: true };
          break;
        }
        case "key":
          pet?.window?.webContents.sendInputEvent({ type: "keyDown", keyCode: body.key });
          pet?.window?.webContents.sendInputEvent({ type: "keyUp", keyCode: body.key });
          result = { ok: true };
          break;
        case "eval":
          result = await petEval(body.code);
          break;
        case "debug":
          result = await petEval(`window.__pet && window.__pet.onDebug(${JSON.stringify(body.payload ?? {})})`);
          break;
        case "recall":
          pet?.recall();
          result = { ok: true };
          break;
        case "start-drag":
          pet?.startDrag();
          result = { ok: true };
          break;
        case "end-drag":
          pet?.endDrag();
          result = { ok: true };
          break;
        case "gallery": {
          const { character = "whale", page = 0, mode = "desk" } = body;
          const win = new BrowserWindow({
            width: 1600,
            height: 720,
            show: false,
            backgroundColor: "#e9e3d7",
            webPreferences: { contextIsolation: true, sandbox: true, offscreen: true },
          });
          const url = `file://${path.join(__dirname, "poses.html")}?character=${character}&page=${page}&mode=${mode}`;
          await win.loadURL(url);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const image = await win.webContents.capturePage();
          const file = body.path || `/tmp/pet-poses-${character}-${mode}-${page}.png`;
          fs.writeFileSync(file, image.toPNG());
          win.destroy();
          result = { ok: true, path: file, size: image.getSize() };
          break;
        }
        case "capture": {
          if (!pet?.window || pet.window.isDestroyed()) { result = { ok: false }; break; }
          const image = await pet.window.webContents.capturePage();
          const file = body.path || "/tmp/pet-window.png";
          fs.writeFileSync(file, image.toPNG());
          result = { ok: true, path: file, size: image.getSize() };
          break;
        }
        case "quit":
          result = { ok: true };
          setTimeout(() => app.quit(), 100);
          break;
        default:
          json(res, 400, { error: `unknown action ${action}` });
          return;
      }
      json(res, 200, { result, state: action === "quit" ? null : await snapshot() });
    } catch (error) {
      json(res, 500, { error: String(error?.stack ?? error) });
    }
  });
  server.listen(18765, "127.0.0.1", () => console.log("[harness] control on http://127.0.0.1:18765"));
}
