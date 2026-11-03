/**
 * Dev-only harness: loads the real client bundle against a mock loader, a
 * mock React and a mock Cordis context, so the pet can be exercised (and
 * screenshotted) in a plain browser. Not shipped to the package.
 */
window.addEventListener("error", (event) => {
  const box = document.createElement("pre");
  box.id = "preview-error";
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;max-width:900px;white-space:pre-wrap;background:#2b1d1d;color:#ffd9d9;font:11px monospace;padding:8px;border-radius:6px";
  box.textContent = `preview error: ${event.message}\n${event.error?.stack || ""}`;
  document.body.appendChild(box);
});
window.addEventListener("unhandledrejection", (event) => {
  const box = document.createElement("pre");
  box.id = "preview-rejection";
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;max-width:900px;white-space:pre-wrap;background:#2b1d1d;color:#ffd9d9;font:11px monospace;padding:8px;border-radius:6px";
  box.textContent = `preview rejection: ${event.reason?.stack || event.reason}`;
  document.body.appendChild(box);
});

const params = new URLSearchParams(location.search);
const wanted = {
  pose: params.get("pose") || "idle",
  panel: params.get("panel") || "",
  character: params.get("character") || "",
  skin: params.get("skin") || "",
  size: params.get("size") || "",
};

/* ------------------------------ mini React ------------------------------ */
let pendingEffects = [];

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity) };
  },
  useRef(initial) { return { current: initial ?? null }; },
  useEffect(fn) { pendingEffects.push(fn); },
  useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; },
  Fragment: "__fragment",
};

function renderNode(node, container) {
  if (node === null || node === undefined || node === false || node === true) return;
  if (Array.isArray(node)) { node.forEach((child) => renderNode(child, container)); return; }
  if (typeof node === "string" || typeof node === "number") {
    container.appendChild(document.createTextNode(String(node)));
    return;
  }
  const { type, props, children } = node;
  if (typeof type === "function") { renderNode(type(props), container); return; }
  if (type === "__fragment") { children.forEach((child) => renderNode(child, container)); return; }
  const el = document.createElement(type);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "children" || value === null || value === undefined) continue;
    if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "ref" && typeof value === "object") value.current = el;
    else if (key === "hidden") { if (value) el.hidden = true; }
    else if (key === "className") el.className = String(value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, String(value));
  }
  children.forEach((child) => renderNode(child, el));
  container.appendChild(el);
}

/* ------------------------------- mock DSH ------------------------------- */
const overlay = document.getElementById("dshpet-slot");
const state = {
  sessionId: wanted.pose === "idle" ? null : "session-preview",
  running: wanted.pose === "working",
  waiting: wanted.pose === "waiting",
};

const ctx = {
  effect(fn) { const cleanup = fn(); return cleanup; },
  on() { return () => {}; },
  slots: {
    inject(_name, register) { register(); },
    register(options, Component) {
      if (options.name === "shell.overlay") {
        const host = document.createElement("div");
        host.style.cssText = "position:absolute;inset:0;pointer-events:none";
        overlay.appendChild(host);
        renderNode(Component({}), host);
      }
      return () => {};
    },
  },
  uiSession: {
    current: { getSnapshot: () => ({ sessionId: state.sessionId }), subscribe: () => () => {} },
    sessionStatus: {
      getSnapshot: () => new Map(state.sessionId ? [[state.sessionId, {
        running: state.running,
        ...(state.waiting ? { pendingInteraction: "tool" } : {}),
      }]] : []),
      subscribe: () => () => {},
    },
  },
  sessions: { list: { getSnapshot: () => ({ byId: {} }) }, binding: () => undefined },
  uiWorkspace: { openSession: (id) => { window.__lastJump = id; } },
  layout: { selectPanel: () => {} },
};

window.__ModuleLoader__ = {
  load({ factory }) {
    const plugin = factory((name) => {
      if (name === "react") return React;
      throw new Error(`preview: unknown module ${name}`);
    });
    plugin.apply(ctx);
    document.documentElement.dataset.effects = String(pendingEffects.length);
    pendingEffects.forEach((fn) => fn());
    document.documentElement.dataset.afterEffects = String(document.querySelectorAll("#dshpet-root").length);
    pendingEffects = [];
    document.documentElement.dataset.petMounted = "1";
    setTimeout(interact, 260);
  },
};

function petCenter() {
  const canvas = document.getElementById("dshpet-pet");
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + 380, y: rect.top + 200 };
}

function interact() {
  const { x, y } = petCenter();
  if (wanted.panel === "card") {
    window.dispatchEvent(new MouseEvent("dblclick", { clientX: x, clientY: y, bubbles: true }));
  } else if (wanted.panel === "menu" || wanted.panel === "settings") {
    document.documentElement.dispatchEvent(new MouseEvent("contextmenu", { clientX: x, clientY: y, bubbles: true, cancelable: true }));
    if (wanted.panel === "settings") {
      setTimeout(() => {
        const button = [...document.querySelectorAll("#dshpet-menu button")].find((b) => b.textContent.includes("设置"));
        button?.click();
      }, 120);
    }
  }
  setTimeout(() => {
  }, 400);
  setTimeout(() => {
    const menu = document.querySelector("#dshpet-menu");
    if (menu && !menu.hidden) {
      const r = menu.getBoundingClientRect();
      const el = document.createElement("pre");
      el.id = "preview-late";
      el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;background:#0b1220;color:#cfe;font:11px monospace;padding:6px";
      const rootEl = document.querySelector("#dshpet-root");
      const rr = rootEl.getBoundingClientRect();
      const slot = document.getElementById("dshpet-slot").getBoundingClientRect();
      el.textContent = `late menu rect=${r.left|0},${r.top|0} style=${menu.style.left}/${menu.style.top} root=${rr.top|0},${rr.height|0} slot=${slot.top|0},${slot.height|0} inner=${innerWidth}x${innerHeight} stageTop=${document.querySelector("#dshpet-stage").style.transform}`;
      document.body.appendChild(el);
    }
  }, 2600);
  document.documentElement.dataset.petReady = "1";
}

// seed the config the bundle will read, so each screenshot can pick a skin
if (wanted.character || wanted.skin || wanted.size) {
  const key = "dsh-desktop-pet:config:v1";
  let config = {};
  try { config = JSON.parse(localStorage.getItem(key) || "{}"); } catch { config = {}; }
  if (wanted.character) config.character = wanted.character;
  if (wanted.skin) config.skin = { ...(config.skin || {}), [wanted.character || "whale"]: wanted.skin };
  if (wanted.size) config.size = Number(wanted.size);
  localStorage.setItem(key, JSON.stringify(config));
}

const script = document.createElement("script");
script.src = "../client.js";
document.body.appendChild(script);
