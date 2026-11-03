#!/usr/bin/env node
/**
 * 宠物安装用的小工具，Mac 和 Windows 共用；不依赖任何第三方包。
 * 用 DSH 自己当 Node 跑：ELECTRON_RUN_AS_NODE=1 "<DSH 程序>" tools/patch.mjs <命令> ...
 *
 *   patch <官方 app.asar> <输出 app.asar> <pet 目录>   在官方原包上原地改包头：换 lib/main.js、lib/preload-app.cjs，
 *                                                      加 pet/**；不解包重打，app.asar.unpacked 里的原生模块不动。
 *                                                      最后一行输出新包头的 SHA256。
 *   has-pet <app.asar>                                 包里已经有宠物 → 输出 yes，否则 no
 *   fuse <Electron 可执行文件>                          看「内嵌 asar 完整性校验」开关；开着就关掉（Windows 上改了 asar 才不会打不开）
 *   profile <profile 目录> <插件目录>                    装插件（只拷 package.json 的 files）进 node_modules，改 profile 的 package.json
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// 用 DSH（Electron）当 Node 跑时，fs 会把 .asar 文件当压缩包打开；这里要读写原始字节
process.noAsar = true;

const MAIN_ANCHOR = "import { REMOTE_STREAM_MUX_PATH, parseRemoteStreamServerMessage } from \"@deepseek-ai/dsh-api-gateway/stream-protocol\";";
const WINDOW_ANCHOR = "\tmainWindow = createMainWindow();";
const INJECT = "\tmainWindow = createMainWindow();\n\t// Native desktop pet: a transparent, always-on-top window owned by the shell.\n\t// When disabled it holds no renderer and no drawing timer.\n\ttry {\n\t\tconst desktopPet = new DesktopPet({ app, getMainWindow: () => mainWindow });\n\t\tglobalThis.__DSHPet = desktopPet;\n\t\tdesktopPet.attach(mainWindow);\n\t} catch (error) {\n\t\tconsole.warn(\"desktop pet failed to start\", error);\n\t}";
const BRIDGE = "\n//#region dsh desktop pet bridge\nif (location.protocol === `dsh-app:` && location.hostname === \"app\") {\n\tconst petStateListeners = new Set();\n\tconst petJumpListeners = new Set();\n\telectron.ipcRenderer.on(\"dsh-pet:ui-state\", (_event, payload) => {\n\t\tfor (const listener of petStateListeners) {\n\t\t\ttry { listener(payload); } catch { /* settings UI must not break the shell */ }\n\t\t}\n\t});\n\telectron.ipcRenderer.on(\"dsh-pet:jump-to\", (_event, sessionId) => {\n\t\tfor (const listener of petJumpListeners) {\n\t\t\ttry { listener(sessionId ?? null); } catch { /* navigation is best-effort */ }\n\t\t}\n\t});\n\t// 在主窗口里按下鼠标时告诉宠物：它的菜单/面板该收起了（宠物没开菜单时主进程直接忽略）\n\twindow.addEventListener(\"mousedown\", () => electron.ipcRenderer.send(\"dsh-pet:ui-event\", { kind: \"outside\" }), true);\n\telectron.contextBridge.exposeInMainWorld(\"__dshPet\", {\n\t\tgetState: () => electron.ipcRenderer.invoke(\"dsh-pet:ui-get\"),\n\t\tsetConfig: (patch) => electron.ipcRenderer.invoke(\"dsh-pet:ui-set\", patch),\n\t\tevent: (payload) => electron.ipcRenderer.send(\"dsh-pet:ui-event\", payload),\n\t\tonState: (listener) => {\n\t\t\tpetStateListeners.add(listener);\n\t\t\treturn () => petStateListeners.delete(listener);\n\t\t},\n\t\tonJump: (listener) => {\n\t\t\tpetJumpListeners.add(listener);\n\t\t\treturn () => petJumpListeners.delete(listener);\n\t\t}\n\t});\n}\n//#endregion\n";
const BLOCK = 4 * 1024 * 1024;

function patchMain(text) {
  if (text.includes("DesktopPet")) return text;
  if (!text.includes(MAIN_ANCHOR) || !text.includes(WINDOW_ANCHOR)) throw new Error("lib/main.js 里找不到插入位置：DSH 版本变了，需要更新补丁");
  return text.replace(MAIN_ANCHOR, MAIN_ANCHOR + '\nimport { DesktopPet } from "../pet/pet-main.js";').replace(WINDOW_ANCHOR, INJECT);
}

function patchPreload(text) {
  return text.includes("__dshPet") ? text : text + BRIDGE;
}

function readAsar(file) {
  const raw = fs.readFileSync(file);
  const headerPickleSize = raw.readUInt32LE(4);
  const strLen = raw.readUInt32LE(12);
  const header = JSON.parse(raw.subarray(16, 16 + strLen).toString("utf8"));
  return { header, data: raw.subarray(8 + headerPickleSize) };
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function integrity(content) {
  const blocks = [];
  for (let i = 0; i < Math.max(content.length, 1); i += BLOCK) blocks.push(sha(content.subarray(i, i + BLOCK)));
  return { algorithm: "SHA256", hash: sha(content), blockSize: BLOCK, blocks };
}

class Asar {
  constructor(file) {
    Object.assign(this, readAsar(file));
    this.extra = [];
    this.extraLen = 0;
  }
  node(rel, create = false) {
    const parts = rel.split("/");
    let cur = this.header;
    for (const part of parts.slice(0, -1)) {
      cur.files ??= {};
      if (!cur.files[part]) {
        if (!create) throw new Error(`asar 里没有 ${rel}`);
        cur.files[part] = { files: {} };
      }
      cur = cur.files[part];
    }
    cur.files ??= {};
    const last = parts.at(-1);
    if (!cur.files[last]) {
      if (!create) throw new Error(`asar 里没有 ${rel}`);
      cur.files[last] = {};
    }
    return cur.files[last];
  }
  get(rel) {
    const n = this.node(rel);
    if (n.unpacked) throw new Error(`${rel} 在 app.asar.unpacked 里`);
    const off = Number(n.offset);
    return this.data.subarray(off, off + n.size);
  }
  put(rel, content) {
    const n = this.node(rel, true);
    for (const k of Object.keys(n)) delete n[k];
    n.size = content.length;
    n.offset = String(this.data.length + this.extraLen);
    n.integrity = integrity(content);
    this.extra.push(content);
    this.extraLen += content.length;
  }
  save(file) {
    const headerStr = Buffer.from(JSON.stringify(this.header), "utf8");
    const pad = (4 - (headerStr.length % 4)) % 4;
    const payload = Buffer.concat([u32(headerStr.length), headerStr, Buffer.alloc(pad)]);
    const headerPickle = Buffer.concat([u32(payload.length), payload]);
    const sizePickle = Buffer.concat([u32(4), u32(headerPickle.length)]);
    fs.writeFileSync(file, Buffer.concat([sizePickle, headerPickle, this.data, ...this.extra]));
    return sha(headerStr);
  }
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}

const FUSE_SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");
const FUSE_ASAR_INTEGRITY = 4;

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "patch") {
  const [src, out, petDir] = args;
  const a = new Asar(src);
  if (a.header.files.pet) throw new Error("源 asar 已经打过补丁；请用官方原包（backup 里的 app.asar.orig）");
  a.put("lib/main.js", Buffer.from(patchMain(a.get("lib/main.js").toString("utf8")), "utf8"));
  a.put("lib/preload-app.cjs", Buffer.from(patchPreload(a.get("lib/preload-app.cjs").toString("utf8")), "utf8"));
  for (const rel of walk(petDir)) {
    if (/\.(js|cjs|css|html|png)$/.test(rel)) a.put(`pet/${rel}`, fs.readFileSync(path.join(petDir, rel)));
  }
  console.log(a.save(out));
} else if (cmd === "has-pet") {
  console.log(readAsar(args[0]).header.files.pet ? "yes" : "no");
} else if (cmd === "fuse") {
  const file = args[0];
  const buf = fs.readFileSync(file);
  const i = buf.indexOf(FUSE_SENTINEL);
  if (i < 0) { console.log("no-fuses"); process.exit(0); }
  const at = i + FUSE_SENTINEL.length + 2 + FUSE_ASAR_INTEGRITY;
  if (buf[at] !== 0x31) { console.log("off"); process.exit(0); }
  fs.copyFileSync(file, `${file}.pre-pet`);
  buf[at] = 0x30;
  fs.writeFileSync(file, buf);
  console.log("turned-off");
} else if (cmd === "profile") {
  const [profile, pluginDir] = args;
  const dest = path.join(profile, "node_modules", "dsh-desktop-pet");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // 只拷 package.json 里 files 列出的东西（仓库里还有设计稿、桌面版源码、备份，不能整个拷进去）
  const own = JSON.parse(fs.readFileSync(path.join(pluginDir, "package.json"), "utf8"));
  for (const entry of ["package.json", ...(own.files ?? [])]) {
    const rel = entry.split("/*")[0];
    const from = path.join(pluginDir, rel);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dest, rel), { recursive: true });
  }
  const pkgFile = path.join(profile, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  fs.copyFileSync(pkgFile, `${pkgFile}.before-pet`);
  pkg.dependencies = { ...(pkg.dependencies ?? {}), "dsh-desktop-pet": "1.0.0" };
  pkg.dsh ??= {};
  pkg.dsh.profile ??= {};
  pkg.dsh.profile.bundles ??= [];
  if (!pkg.dsh.profile.bundles.includes("dsh-desktop-pet")) pkg.dsh.profile.bundles.push("dsh-desktop-pet");
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
  console.log("ok");
} else {
  console.error("用法见文件开头注释");
  process.exit(2);
}
