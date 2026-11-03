#!/usr/bin/env node
/**
 * Dev-only screenshot helper: drives headless Chrome over CDP with a real
 * wall-clock wait, so CSS animations and the pet's first frames are settled
 * before the capture (virtual time freezes both mid-flight).
 *
 *   node tools/shoot.mjs <url> <out.png> [width] [height] [waitMs]
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT || 9333);
const [, , url, out, w = "1280", h = "820", wait = "2600"] = process.argv;
if (!url || !out) {
  console.error("usage: node tools/shoot.mjs <url> <out.png> [width] [height] [waitMs]");
  process.exit(1);
}

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  `--window-size=${w},${h}`,
  `--user-data-dir=/tmp/pet-shoot-${process.pid}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
chrome.stderr.on("data", () => {});

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const info = await res.json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await delay(120);
  }
  throw new Error("chrome did not start");
}

const ws = new WebSocket(await endpoint());
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false,
}, sessionId);
await send("Page.navigate", { url }, sessionId);
await delay(Number(wait));
if (process.env.EVAL) {
  const probe = await send("Runtime.evaluate", { expression: process.env.EVAL, returnByValue: true }, sessionId);
  console.log("EVAL:", JSON.stringify(probe.result?.value ?? probe.result, null, 2));
}
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out} (${w}x${h})`);
ws.close();
chrome.kill("SIGKILL");
