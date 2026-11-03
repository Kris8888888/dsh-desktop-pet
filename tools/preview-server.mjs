#!/usr/bin/env node
/**
 * Dev-only server for tools/preview.html: serves the plugin package plus the
 * sprite route the Host row would register, so the real client bundle can be
 * exercised in a plain browser without DSH.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8791);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = url.pathname === "/" ? "/tools/preview.html" : url.pathname;
  if (file.startsWith("/api/desktop-pet/sprites/")) {
    file = "/sprites/" + file.slice("/api/desktop-pet/sprites/".length);
  }
  const target = join(ROOT, normalize(file).replace(/^([/\\])+/, ""));
  if (!target.startsWith(ROOT)) { res.statusCode = 403; res.end(); return; }
  try {
    const body = await readFile(target);
    res.setHeader("content-type", TYPES[extname(target)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("not found: " + file);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`preview on http://127.0.0.1:${PORT}/`));
