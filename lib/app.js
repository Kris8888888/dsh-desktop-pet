export function createPet({ host, root }) {
import { PetArt, CHARACTERS, drawPostcard, SIZES, petScale, STAGE_W } from "./art.js";
import { SKINS } from "./sprite.js";
import { PetLife, DEFAULT_CONFIG, dayKey, formatTokens } from "./state.js";
import { placeById } from "./places.js";

const $ = (id) => root.querySelector(`#dshpet-${id}`);

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

class PetApp {
  constructor() {
    this.stage = $("stage");
    this.canvas = $("pet");
    this.art = new PetArt(this.canvas);
    this.host = host;
    this.life = null;
    this.config = { ...DEFAULT_CONFIG };
    this.mode = "desk";
    this.clipCss = 300;
    this.stagePos = { x: 0, y: 0 };
    this.runtime = {
      now: Date.now(),
      working: false,
      waiting: false,
      waitingSession: null,
      sessionTitle: null,
      errorUntil: 0,
      celebrateUntil: 0,
      pettedUntil: 0,
      waveUntil: 0,
      pokeUntil: 0,
      eatUntil: 0,
      drag: false,
      angryUntil: 0,
      blinkUntil: 0,
      nextBlinkAt: 0,
      lookX: 0,
      lookY: 0,
      idleSeconds: 0,
      particles: [],
      lastFrame: 0,
      fps: 0,
      drawMs: 0,
      hidden: false,
      noteOpen: false,
      postcardOpen: false,
      cardOpen: false,
      menuOpen: false,
      settingsOpen: false,
      diaryOpen: false,
      lastSaveAt: 0,
      lastThoughtAt: 0,
      travelNoteEl: null,
      greetingShown: false,
      forcePose: null,
      paused: false,
    };
    this.bubbleTimer = null;
    this.bubblePriority = -1;
    this.pendingClick = null;
    this.lastClick = { at: 0, region: null };
    this.dragStart = null;
    this.pointer = { x: 0, y: 0, inside: false };
    this.interactive = null;
    this.petArea = { x0: 96, x1: 284, y0: 78, y1: 300 };
  }

  async start() {
    const init = await this.host.init();
    this.config = { ...DEFAULT_CONFIG, ...(init.config || {}) };
    this.life = new PetLife(init.state, Date.now());
    this.life.state.character = this.config.character === "crab" ? "crab" : "whale";
    this.mode = init.mode || "perch";
    this.clipCss = init.clipCss ?? 300;
    this.applyMode(this.mode, this.clipCss);
    this.bindUi();
    this.bindPointer();
    this.bindHost();
    this.buildTravelNote();
    this.applyConfigUi();
    this.showGreeting();
    this.showUnreadPostcard();
    this.runtime.nextBlinkAt = performance.now() + 2500 + Math.random() * 3000;

    if (!this.config.enabled) {
      this.stage.dataset.mode = "hidden";
      return;
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pauseLoop();
      else this.resumeLoop();
    });
    this.loop(performance.now());
    setInterval(() => this.tickSecond(), 1000);
    setInterval(() => this.autosave(), 2000);
  }

  bindHost() {
    this.host.onEvent?.((event) => this.onHostEvent(event));
    window.addEventListener("pagehide", () => this.saveNow());
  }

  onHostEvent(event) {
    if (!event || !event.type) return;
    switch (event.type) {
      case "mode":
        this.applyMode(event.mode, event.clipCss);
        break;
      case "config":
        this.config = { ...this.config, ...event.config };
        if (event.config?.character) this.life.state.character = event.config.character === "crab" ? "crab" : "whale";
        this.applyConfigUi();
        if (!this.config.enabled) this.stage.dataset.mode = "hidden";
        break;
      case "dismiss":
        this.dismissAll();
        break;
      case "idle":
        this.runtime.idleSeconds = event.seconds ?? 0;
        break;
      case "dsh":
        this.onDshEvent(event);
        break;
      case "show":
        this.runtime.hidden = false;
        this.stage.dataset.mode = this.mode;
        break;
      case "hide":
        this.runtime.hidden = true;
        this.stage.dataset.mode = "hidden";
        break;
      case "reset":
        this.life = new PetLife(null, Date.now());
        this.life.state.character = this.config.character === "crab" ? "crab" : "whale";
        this.saveNow();
        this.say("重新认识一下。");
        break;
      case "reminder":
        this.say(event.text ?? "提醒你一下。", { priority: 3 });
        break;
      case "debug":
        this.onDebug(event);
        break;
      default:
        break;
    }
  }

  onDshEvent(event) {
    const now = Date.now();
    switch (event.kind) {
      case "working":
        this.runtime.working = true;
        this.runtime.waiting = false;
        this.runtime.waitingSession = null;
        if (this.life.state.sleeping) this.life.state.sleeping = false;
        break;
      case "idle":
        this.runtime.working = false;
        break;
      case "waiting":
        this.runtime.working = false;
        this.runtime.waiting = true;
        this.runtime.waitingSession = event.sessionId ?? null;
        this.runtime.sessionTitle = event.title ?? this.runtime.sessionTitle;
        this.say("有个确认在等你。", { jump: true, sticky: true, priority: 5 });
        break;
      case "waiting-clear":
        if (!event.sessionId || event.sessionId === this.runtime.waitingSession) {
          this.runtime.waiting = false;
          this.runtime.waitingSession = null;
          this.hideBubbleIfJump();
        }
        break;
      case "done":
        this.runtime.working = false;
        this.runtime.waiting = false;
        this.runtime.celebrateUntil = now + 4800;
        this.life.completeTask(now);
        this.spawnConfetti(26);
        this.say("搞定啦。", { priority: 3 });
        break;
      case "error":
        this.runtime.working = false;
        this.runtime.errorUntil = now + 6000;
        this.say("呜…出错了。", { priority: 4 });
        break;
      case "tokens": {
        const bite = this.life.feedTokens(event.tokens ?? 0, now);
        this.runtime.eatUntil = now + 2200;
        this.spawnTokens(Math.min(12, 4 + Math.round((event.tokens ?? 0) / 20_000)));
        if (bite !== null && event.tokens > 20_000 && !this.runtime.celebrateUntil) {
          this.say("谢谢招待。", { priority: 1 });
        }
        break;
      }
      case "session":
        this.runtime.sessionTitle = event.title ?? null;
        break;
      case "jump-result":
        this.say("带你过去～");
        break;
      case "greet":
        this.runtime.greetingShown = false;
        this.showGreeting();
        break;
      case "recall":
        this.host.recall?.();
        break;
      case "visibility":
        if (event.visible === false) this.pauseLoop();
        else this.resumeLoop();
        break;
      default:
        break;
    }
  }

  onDebug(event) {
    const { action, payload } = event;
    if (action === "pose" && payload?.pose) {
      this.runtime.forcePose = payload.pose;
      if (payload.pose === "perch") this.applyMode("perch", 190);
      else if (payload.pose === "desk") this.applyMode("desk", 300);
    } else if (action === "set-state" && payload) {
      Object.assign(this.life.state, payload);
    } else if (action === "event" && payload) {
      this.onHostEvent(payload);
    } else if (action === "say") {
      this.say(payload?.text ?? "你好");
    } else if (action === "clear-bubble") {
      this.hideBubble();
    } else if (action === "open" && payload?.panel) {
      this.openPanel(payload.panel);
    } else if (action === "time-travel" && payload?.minutes) {
      const delta = payload.minutes * 60_000;
      this.life.state.lastTickAt -= delta;
      if (this.life.state.travel) this.life.state.travel.returnAt -= delta;
      this.life.tick(Date.now(), { working: this.runtime.working, waiting: this.runtime.waiting, idleSeconds: this.runtime.idleSeconds });
    }
  }

  applyMode(mode, clipCss) {
    this.mode = mode;
    this.clipCss = clipCss ?? (mode === "perch" ? 190 : 300);
    this.stage.dataset.mode = mode;
    const note = this.runtime.travelNoteEl;
    if (note) note.dataset.mode = mode;
    setTimeout(() => this.placeBubble(), 120);
  }

  saveNow() {
    if (!this.life) return;
    this.host.save(this.life.snapshot());
    this.runtime.lastSaveAt = Date.now();
  }

  autosave() {
    const now = Date.now();
    if (now - this.runtime.lastSaveAt < 1800) return;
    this.saveNow();
  }

  tickSecond() {
    if (!this.life) return;
    const now = Date.now();
    const events = this.life.tick(now, {
      working: this.runtime.working,
      waiting: this.runtime.waiting,
      idleSeconds: this.runtime.idleSeconds,
    });
    for (const event of events) this.onLifeEvent(event);
    if (this.runtime.cardOpen) this.renderCard();
    if (this.runtime.travelNoteEl) this.renderTravelNote();
    if (this.life.state.sleeping) this.runtime.working = false;
    // Postcard arrives even when the window was hidden while travelling.
    if (this.life.state.postcard && !this.life.state.postcard.seen && !this.runtime.postcardOpen) {
      setTimeout(() => this.showPostcard(), 700);
    }
    this.autosave();
  }

  onLifeEvent(event) {
    switch (event.type) {
      case "diary":
        if (event.entry) this.toast("日记写好了一页");
        break;
      case "sick":
        this.say("我好像生病了…");
        this.host.notify?.({ title: "小宠物生病了", body: "它饿得太久了。先喂点零食，再喂药。" });
        break;
      case "reminder":
        this.say(event.text, { priority: 3 });
        if (this.config.notify && event.notify) this.host.notify?.({ title: "小宠物的提醒", body: event.text });
        break;
      case "thought":
        this.say(event.text, { priority: 0 });
        break;
      case "postcard":
        this.spawnConfetti(10);
        setTimeout(() => this.showPostcard(event.postcard), 600);
        break;
      case "sleep":
        this.hideBubble();
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* UI                                                               */
  /* ---------------------------------------------------------------- */

  bindUi() {
    $("card-close").addEventListener("click", () => this.openPanel(null));
    root.querySelectorAll(".card-actions button").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "diary") this.openDiary();
        if (action === "recall") { this.host.recall?.(); this.openPanel(null); this.toast("爬回窗口啦"); }
        if (action === "settings") this.openSettings();
      });
    });
    $("settings-close").addEventListener("click", () => this.openPanel(null));
    $("opt-enabled").addEventListener("click", () => {
      const enabled = $("opt-enabled").getAttribute("aria-checked") !== "true";
      this.updateConfig({ enabled });
    });
    $("opt-notify").addEventListener("click", () => {
      const notify = $("opt-notify").getAttribute("aria-checked") !== "true";
      this.updateConfig({ notify });
    });
    $("opt-hearts").addEventListener("click", () => {
      const hearts = $("opt-hearts").getAttribute("aria-checked") !== "true";
      this.updateConfig({ hearts });
    });
    $("opt-size").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button) this.updateConfig({ size: Number(button.dataset.value) });
    });
    $("opt-skin").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button) this.updateConfig({ skin: { ...this.config.skin, [this.life.state.character]: button.dataset.value } });
    });
    root.querySelectorAll("#opt-character button").forEach((button) => {
      button.addEventListener("click", () => {
        this.updateConfig({ character: button.dataset.value });
        this.life.state.character = button.dataset.value;
        this.say(button.dataset.value === "crab" ? "换成小螃蟹啦。" : "换成小鲸鱼啦。");
      });
    });
    let resetArmed = false;
    $("opt-reset").addEventListener("click", () => {
      if (!resetArmed) {
        resetArmed = true;
        $("opt-reset").textContent = "再点一次确认";
        setTimeout(() => { resetArmed = false; $("opt-reset").textContent = "重置宠物数据"; }, 2600);
        return;
      }
      resetArmed = false;
      $("opt-reset").textContent = "重置宠物数据";
      this.host.reset?.();
      this.life = new PetLife(null, Date.now());
      this.life.state.character = this.config.character === "crab" ? "crab" : "whale";
      this.saveNow();
      this.openPanel(null);
      this.say("重新认识一下。");
    });
    $("bubble").addEventListener("click", (event) => {
      if (event.target.closest(".bubble-jump")) {
        this.jumpToWaiting();
      }
    });
    document.addEventListener("contextmenu", (event) => {
      const inside = root.contains(event.target);
      const overPet = this.hitTest(event.clientX, event.clientY) !== null;
      if (!inside && !overPet) return;
      if (event.target.closest?.(".panel, .bubble")) return;
      event.preventDefault();
      if (this.life.state.travel) this.openTravelMenu(event.clientX, event.clientY);
      else if (overPet) this.openMenu(event.clientX, event.clientY);
    });
  }

  updateConfig(patch) {
    this.config = { ...this.config, ...patch };
    const result = this.host.setConfig?.(patch);
    if (result?.then) {
      result.then((config) => {
        if (config) this.config = { ...this.config, ...config };
        this.applyConfigUi();
      }).catch(() => {});
    }
    this.applyConfigUi();
    if (patch.enabled === false) {
      this.stage.dataset.mode = "hidden";
    }
  }

  applyConfigUi() {
    const setSwitch = (id, value) => {
      const el = $(id);
      if (el) el.setAttribute("aria-checked", value ? "true" : "false");
    };
    setSwitch("opt-enabled", this.config.enabled);
    setSwitch("opt-notify", this.config.notify);
    setSwitch("opt-hearts", this.config.hearts);
    root.querySelectorAll("#opt-character button").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.value === this.life.state.character ? "true" : "false");
    });
    const size = petScale(this.config.size);
    $("opt-size").innerHTML = SIZES.map((o) => `<button data-value="${o.value}" aria-pressed="${o.value === size}">${o.label}</button>`).join("");
    const character = this.life?.state.character === "crab" ? "crab" : "whale";
    const current = this.config.skin?.[character];
    const skins = Object.entries(SKINS[character]);
    const active = skins.some(([key]) => key === current) ? current : skins[0][0];
    $("opt-skin").innerHTML = skins.map(([key, sk]) => `<button data-value="${key}" aria-pressed="${key === active}"><i style="background:${sk.top ?? sk.body}"></i>${sk.label}</button>`).join("");
    this.placeBubble?.();
  }

  openPanel(panel) {
    this.runtime.cardOpen = panel === "card";
    this.runtime.settingsOpen = panel === "settings";
    this.runtime.diaryOpen = panel === "diary";
    $("status-card").hidden = panel !== "card";
    $("settings").hidden = panel !== "settings";
    $("diary").hidden = panel !== "diary";
    $("menu").hidden = true;
    this.runtime.menuOpen = false;
    if (panel === "card") this.renderCard();
    if (panel === "diary") this.renderDiary();
    this.setInteractive(this.interactive ?? true);
  }

  openSettings() {
    this.openPanel("settings");
  }

  renderCard() {
    const s = this.life.state;
    const name = CHARACTERS[s.character]?.name ?? "小鲸鱼";
    $("card-name").textContent = name;
    $("card-sub").textContent = CHARACTERS[s.character]?.full ?? "";
    const bars = [
      ["饱腹", s.hunger, "#F2B84B"],
      ["心情", s.mood, "#FF8A9B"],
      ["精力", s.energy, "#5FC7A0"],
      ["亲密度", Math.min(100, s.intimacy), "#5B7CFF"],
      ["健康", s.health, "#7FD0FF"],
    ];
    $("card-bars").innerHTML = bars.map(([label, value, color]) => `
      <div class="bar-row">
        <span>${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${clamp(value, 0, 100)}%;background:${color}"></div></div>
        <b>${Math.round(value)}</b>
      </div>`).join("");
    $("card-days").textContent = `在一起 ${this.life.daysTogether()} 天`;
    $("card-tokens").textContent = `吃掉 ${formatTokens(s.totals.tokens)} token`;
  }

  renderDiary() {
    const list = $("diary").querySelector(".diary-list") ?? (() => {
      const el = document.createElement("div");
      el.className = "diary-list";
      $("diary").appendChild(el);
      return el;
    })();
    const entries = this.life.state.diary;
    if (!entries.length) {
      list.innerHTML = `<div class="diary-empty">还没有日记。<br>明天这个时候再来看看。</div>`;
      return;
    }
    list.innerHTML = entries.map((entry) => `
      <div class="diary-entry">
        <h4>${entry.date}${entry.travel ? ` · ${entry.travel}` : ""}</h4>
        <p>${escapeHtml(entry.text || "")}</p>
      </div>`).join("");
  }

  openDiary() {
    this.openPanel("diary");
  }

  showPostcard(postcard = null) {
    const card = postcard ?? this.life.state.postcard;
    if (!card) return;
    this.runtime.postcardOpen = true;
    this.openPanel(null);
    const place = placeById(card.placeId);
    const el = $("postcard");
    el.hidden = false;
    el.innerHTML = `
      <div class="postcard-head">
        <span class="postcard-place">${escapeHtml(place.name)}</span>
        <span class="postcard-date">${new Date(card.returnedAt || Date.now()).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}</span>
      </div>
      <div class="postcard-scene"><canvas width="160" height="58"></canvas></div>
      <div class="postcard-stamp"><b>${escapeHtml(place.name[0])}</b><span>POST</span></div>
      <p class="postcard-note">${escapeHtml(card.note)}</p>
      <button class="postcard-close">收进日记</button>
    `;
    drawPostcard(el.querySelector("canvas"), place, Date.now() & 0xffff);
    el.querySelector(".postcard-close").addEventListener("click", () => {
      el.hidden = true;
      this.runtime.postcardOpen = false;
      this.life.dismissPostcard();
      this.saveNow();
      this.say("下次再去别的地方。");
    });
    // Click the scene to flip back to the pet.
    el.querySelector(".postcard-scene").addEventListener("click", () => {
      el.hidden = true;
      this.runtime.postcardOpen = false;
      this.life.dismissPostcard();
      this.saveNow();
    });
    this.host.notify?.({ title: "小宠物旅行回来了", body: `从${place.name}带回了一张明信片。` });
  }

  showUnreadPostcard() {
    const card = this.life.state.postcard;
    if (!card || card.seen) return;
    if (Date.now() - card.returnedAt > 86_400_000) {
      this.life.dismissPostcard();
      return;
    }
    setTimeout(() => this.showPostcard(card), 1400);
  }

  /* ---------------------------------------------------------------- */
  /* Speech / toast                                                   */
  /* ---------------------------------------------------------------- */

  say(text, opts = {}) {
    if (!text) return;
    if (!this.life) return;
    const priority = opts.priority ?? 2;
    if (this.bubblePriority > priority && $("bubble").hidden === false) return;
    const bubble = $("bubble");
    bubble.hidden = false;
    bubble.dataset.tail = "down";
    bubble.querySelector(".bubble-text").textContent = text;
    const jump = bubble.querySelector(".bubble-jump");
    jump.hidden = !opts.jump;
    jump.dataset.sessionId = opts.sessionId ?? "";
    this.bubblePriority = priority;
    this.life.state.lastInteractionAt = Date.now();
    clearTimeout(this.bubbleTimer);
    this.placeBubble();
    this.bubbleTimer = setTimeout(() => {
      this.hideBubble();
    }, opts.sticky ? 60_000 : (opts.duration ?? Math.max(2800, Math.min(7000, text.length * 130))));
    this.setInteractive(true);
  }

  /** 把「鼠标该接住的区域」报给主进程：宠物本身 + 正在显示的气泡、出门卡片、面板 */
  reportHotRects() {
    if (!this.host.setHotRects) return;
    const rects = [];
    const b = this.art.bounds;
    if (b && !this.runtime.travel && this.stage.dataset.mode !== "hidden") rects.push({ x: b.left, y: b.top - 4, w: b.right - b.left, h: b.bottom - b.top + 8 });
    for (const el of root.querySelectorAll(".bubble, .travel-note, .panel")) {
      if (el.hidden || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    const key = rects.map((r) => `${r.x | 0},${r.y | 0},${r.w | 0},${r.h | 0}`).join(";");
    if (key === this.hotKey) return;
    this.hotKey = key;
    this.host.setHotRects?.(rects);
  }

  /** 气泡贴着头顶放（宠物大小可调，不能写死位置） */
  placeBubble() {
    const bubble = $("bubble");
    if (bubble.hidden) return;
    const note = this.runtime.travelNoteEl;
    const top = note && !note.hidden ? note.offsetTop : (this.art.bounds?.top ?? 120);
    bubble.style.top = `${Math.max(4, Math.round(top - bubble.offsetHeight - 12))}px`;
  }

  hideBubble() {
    $("bubble").hidden = true;
    this.bubblePriority = -1;
    clearTimeout(this.bubbleTimer);
    this.setInteractive(this.isOverPet(this.pointer.x, this.pointer.y) || this.uiOpen());
  }

  hideBubbleIfJump() {
    const bubble = $("bubble");
    if (!bubble.hidden && !bubble.querySelector(".bubble-jump").hidden) this.hideBubble();
  }

  toast(text) {
    const el = $("toast");
    el.hidden = false;
    el.textContent = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  jumpToWaiting() {
    const bubble = $("bubble");
    const sessionId = bubble.querySelector(".bubble-jump").dataset.sessionId || this.runtime.waitingSession;
    this.host.jump?.(sessionId);
    this.hideBubble();
    this.say("带你过去～");
  }

  /* ---------------------------------------------------------------- */
  /* Context menu                                                     */
  /* ---------------------------------------------------------------- */

  openMenu(x, y) {
    const s = this.life.state;
    const menu = $("menu");
    menu.hidden = false;
    menu.innerHTML = "";
    const add = (label, icon, onClick, opts = {}) => {
      const button = document.createElement("button");
      button.innerHTML = `<span class="menu-icon">${icon}</span><span>${label}</span>${opts.hint ? `<span class="menu-hint">${opts.hint}</span>` : ""}`;
      if (opts.disabled) button.disabled = true;
      button.addEventListener("click", () => {
        menu.hidden = true;
        this.runtime.menuOpen = false;
        this.host.touch?.();
        onClick();
      });
      menu.appendChild(button);
    };
    add("喂零食", "🍪", () => this.doSnack(), { hint: `${s.snacks.left}/3`, disabled: s.snacks.left <= 0 });
    if (s.sick) add("喂药", "💊", () => this.doMedicine(), { hint: s.hunger < 15 ? "先吃饭" : "" });
    add(s.sleeping ? "叫醒它" : "哄睡", s.sleeping ? "☀" : "🌙", () => this.doToggleSleep());
    if (!s.travel) add("出门玩", "🧳", () => this.doTravel());
    else add("叫它回来", "📮", () => this.doCallBack());
    add("摸摸它", "♡", () => this.doPet(true));
    add("看状态", "▤", () => this.openPanel("card"));
    add("日记", "✎", () => this.openDiary());
    add("设置", "⚙", () => this.openSettings());
    if (this.mode !== "perch") add("回窗口", "↥", () => { this.host.recall?.(); this.toast("爬回窗口啦"); });
    const sep = document.createElement("div");
    sep.className = "menu-sep";
    menu.appendChild(sep);
    add("隐藏宠物", "×", () => this.updateConfig({ enabled: false }));

    this.placeBeside(menu);
    this.runtime.menuOpen = true;
    this.setInteractive(true);
  }

  openTravelMenu(x, y) {
    const menu = $("menu");
    menu.hidden = false;
    menu.innerHTML = "";
    const add = (label, icon, onClick, opts = {}) => {
      const button = document.createElement("button");
      button.innerHTML = `<span class="menu-icon">${icon}</span><span>${label}</span>`;
      if (opts.disabled) button.disabled = true;
      button.addEventListener("click", () => {
        menu.hidden = true;
        this.runtime.menuOpen = false;
        this.host.touch?.();
        onClick();
      });
      menu.appendChild(button);
    };
    add("看看它到哪了", "✉", () => this.peekTravel());
    add("叫它回来", "📮", () => this.doCallBack());
    this.placeBeside(menu);
    this.runtime.menuOpen = true;
    this.setInteractive(true);
  }

  peekTravel() {
    const travel = this.life.state.travel;
    if (!travel) return;
    const left = Math.max(0, Math.round((travel.returnAt - Date.now()) / 60000));
    this.say(`它去了${travel.place}，大概还有 ${left} 分钟回来。`);
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  doPet(strong = false) {
    const result = this.life.pet(Date.now(), strong);
    if (!result.ok) {
      if (result.reason === "angry") this.say("哼，先别碰我。");
      if (result.reason === "woke") this.say("唔…被你弄醒了。");
      return;
    }
    this.runtime.pettedUntil = Date.now() + (strong ? 1800 : 1100);
    if (this.config.hearts) this.spawnHearts(strong ? 9 : 4);
    if (Math.random() < 0.22) this.say(strong ? "嘿嘿，好舒服。" : "摸到了。");
  }

  doPoke() {
    const result = this.life.poke(Date.now());
    this.runtime.pokeUntil = Date.now() + 600;
    if (result.angry) {
      this.runtime.angryUntil = this.life.state.angryUntil;
      this.say(result.woke ? "唔！你干嘛。" : "别戳啦！");
    }
  }

  doSnack() {
    const result = this.life.snack(Date.now());
    if (!result.ok) {
      this.say("今天的零食吃完啦。");
      return;
    }
    this.runtime.eatUntil = Date.now() + 1700;
    this.spawnCrumbs(7);
    this.say(result.left === 0 ? "最后一块啦。" : "谢谢！");
    this.saveNow();
  }

  doMedicine() {
    const result = this.life.medicine(Date.now());
    if (!result.ok) {
      if (result.reason === "hungry") this.say("肚子空空的，先吃点东西嘛…");
      else this.say("我现在好好的，不用吃药。");
      return;
    }
    this.runtime.eatUntil = Date.now() + 1500;
    this.spawnStars(8, 150);
    this.say("药好苦…但感觉好多了。");
    this.saveNow();
  }

  doToggleSleep() {
    const sleeping = this.life.toggleSleep(Date.now());
    this.say(sleeping ? "那我睡一会儿…" : "醒啦。");
    this.saveNow();
  }

  doTravel() {
    const result = this.life.startTravel();
    if (!result.ok) {
      this.say(result.reason === "sick" ? "生病的时候不太想出门…" : "它已经在外面啦。");
      return;
    }
    this.runtime.travelNoteEl.hidden = false;
    this.renderTravelNote();
    this.say(`我去${result.place.name}啦，回来给你带明信片。`);
    this.saveNow();
    this.updateTravelVisibility();
  }

  doCallBack() {
    if (!this.life.state.travel) return;
    this.life.callBack();
    this.saveNow();
    this.toast("它正在往回赶…");
  }

  /* ---------------------------------------------------------------- */
  /* Travel / postcard state                                          */
  /* ---------------------------------------------------------------- */

  buildTravelNote() {
    const el = document.createElement("div");
    el.className = "travel-note";
    el.hidden = true;
    el.innerHTML = `<div class="travel-icon">✉</div><div class="travel-copy"><b>出门旅行中</b><span></span></div>`;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      const rect = el.getBoundingClientRect();
      this.openTravelMenu(rect.left + rect.width / 2, rect.bottom + 8);
    });
    this.stage.appendChild(el);
    this.runtime.travelNoteEl = el;
    this.updateTravelVisibility();
  }

  updateTravelVisibility() {
    const el = this.runtime.travelNoteEl;
    if (!el) return;
    const s = this.life.state;
    const away = Boolean(s.travel);
    el.hidden = !away;
    if (away) this.renderTravelNote();
  }

  renderTravelNote() {
    const el = this.runtime.travelNoteEl;
    const travel = this.life.state.travel;
    if (!el || !travel) return;
    el.dataset.mode = this.mode;
    const left = Math.max(0, Math.round((travel.returnAt - Date.now()) / 60000));
    el.querySelector("span").textContent = left > 0 ? `还有约 ${left} 分钟` : "快回来了";
  }

  /* ---------------------------------------------------------------- */
  /* Particles                                                        */
  /* ---------------------------------------------------------------- */

  spawnHearts(count) {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      this.runtime.particles.push({
        kind: "heart",
        x: 70 + Math.random() * 50,
        y: 72 + Math.random() * 14,
        vx: (Math.random() - 0.5) * 10,
        vy: -12 - Math.random() * 12,
        life: 1100 + Math.random() * 500,
        maxLife: 1600,
        color: Math.random() < 0.35 ? "#FF6B8A" : "#FF9FB2",
        born: now,
      });
    }
  }

  spawnTokens(count) {
    for (let i = 0; i < count; i++) {
      this.runtime.particles.push({
        kind: "token",
        x: 60 + Math.random() * 70,
        y: 50 + Math.random() * 30,
        vx: (95 - (60 + Math.random() * 70)) * 0.55,
        vy: (78 - (50 + Math.random() * 30)) * 0.45,
        life: 900 + Math.random() * 450,
        maxLife: 1350,
        born: performance.now(),
      });
    }
  }

  spawnCrumbs(count) {
    for (let i = 0; i < count; i++) {
      this.runtime.particles.push({
        kind: "crumb",
        x: 100 + Math.random() * 20,
        y: 74,
        vx: (Math.random() - 0.5) * 50,
        vy: -15 - Math.random() * 20,
        gravity: 90,
        life: 900,
        maxLife: 900,
        born: performance.now(),
      });
    }
  }

  spawnStars(count, spread = 50) {
    for (let i = 0; i < count; i++) {
      this.runtime.particles.push({
        kind: "sparkle",
        x: 95 + (Math.random() - 0.5) * spread,
        y: 70 + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 10,
        vy: -8 - Math.random() * 8,
        life: 900,
        maxLife: 900,
        born: performance.now(),
      });
    }
  }

  spawnConfetti(count) {
    const colors = ["#5B7CFF", "#FF7A45", "#FFD166", "#5FBF8F", "#FF9FB2", "#8FD8FF"];
    for (let i = 0; i < count; i++) {
      this.runtime.particles.push({
        kind: "confetti",
        x: 30 + Math.random() * 130,
        y: 20 + Math.random() * 30,
        vx: (Math.random() - 0.5) * 60,
        vy: 10 + Math.random() * 40,
        gravity: 40,
        life: 2200,
        maxLife: 2200,
        color: colors[Math.floor(Math.random() * colors.length)],
        born: performance.now(),
      });
    }
  }

  updateParticles(dtMs) {
    const now = performance.now();
    const dt = Math.min(50, dtMs) / 1000;
    const list = this.runtime.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += (p.vx ?? 0) * dt;
      p.y += (p.vy ?? 0) * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.life -= dtMs;
      if (p.life <= 0 || p.y > 340) list.splice(i, 1);
    }
    if (list.length > 160) list.splice(0, list.length - 160);
  }

  /* ---------------------------------------------------------------- */
  /* Main loop                                                        */
  /* ---------------------------------------------------------------- */

  loop(ts) {
    this.loopTimer = null;
    if (this.runtime.paused) return;
    const elapsed = this.runtime.lastFrame ? ts - this.runtime.lastFrame : 16;
    this.runtime.lastFrame = ts;
    const now = Date.now();
    const busy = this.isBusyAnimating(now);
    // Direct drawing at a deliberately low cadence: 3 fps when nothing is
    // happening, 15 fps while DSH works, 24 fps only for particles. This keeps
    // the pet inside the 0.35% / 1.5% CPU budget instead of burning a 60 Hz
    // requestAnimationFrame slot on a transparent window.
    const targetFps = this.runtime.particles.length > 0 ? 20 : busy ? 10 : 2;
    this.updateLifetime(now);
    const t = ts / 1000;
    const pose = this.currentPose(now);
    this.updateParticles(elapsed);
    const started = performance.now();
    if (pose === "travel") {
      this.art.clear();
    } else this.art.draw({
      character: this.life.state.character,
      pose,
      t,
      mode: this.mode,
      clipCss: this.mode === "perch" ? this.clipCss : 300,
      lookX: this.runtime.lookX,
      lookY: this.runtime.lookY,
      size: this.config.size,
      skin: this.config.skin?.[this.life.state.character],
      particles: this.runtime.particles,
    });
    this.runtime.drawMs = performance.now() - started;
    this.reportHotRects();
    this.frameCount = (this.frameCount ?? 0) + 1;
    if (!this.fpsStarted) { this.fpsStarted = ts; this.fpsFrames = 0; }
    this.fpsFrames++;
    if (ts - this.fpsStarted > 1000) {
      this.runtime.fps = Math.round((this.fpsFrames * 1000) / (ts - this.fpsStarted));
      this.fpsStarted = ts;
      this.fpsFrames = 0;
    }
    this.scheduleFrame(targetFps);
  }

  scheduleFrame(fps) {
    if (this.runtime.paused) return;
    clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.loop(performance.now()), Math.max(16, Math.round(1000 / fps)));
  }

  pauseLoop() {
    this.runtime.paused = true;
    clearTimeout(this.loopTimer);
    this.loopTimer = null;
  }

  resumeLoop() {
    if (!this.runtime.paused) return;
    this.runtime.paused = false;
    this.runtime.lastFrame = 0;
    this.scheduleFrame(3);
  }

  shouldDraw(elapsed, targetFps) {
    this.drawAccumulator = (this.drawAccumulator ?? 0) + elapsed;
    const interval = 1000 / targetFps;
    if (this.drawAccumulator < interval) return false;
    this.drawAccumulator = Math.min(this.drawAccumulator % interval, interval);
    return true;
  }

  updateLifetime(now) {
    if (!this.life) return;
    if (this.life.state.angryUntil > now) this.runtime.angryUntil = this.life.state.angryUntil;
    if (this.life.state.sleeping && this.runtime.working) this.runtime.working = false;
    this.updateTravelVisibility();
    // Smoothly point the eyes at the cursor.
    if (this.pointer.inside) {
      const dx = clamp((this.pointer.x - this.stagePos.x - STAGE_W / 2) / 90, -1, 1);
      const dy = clamp((this.pointer.y - this.stagePos.y - 120) / 80, -1, 1);
      this.runtime.lookX += (dx * 1.7 - this.runtime.lookX) * 0.18;
      this.runtime.lookY += (dy * 1.7 - this.runtime.lookY) * 0.18;
    } else {
      this.runtime.lookX *= 0.94;
      this.runtime.lookY *= 0.94;
    }
    if (this.runtime.nextBlinkAt && performance.now() > this.runtime.nextBlinkAt && !this.life.state.sleeping) {
      this.runtime.blinkUntil = performance.now() + 600;
      this.runtime.nextBlinkAt = performance.now() + 3000 + Math.random() * 4200;
    }
  }

  currentPose(now) {
    if (this.runtime.forcePose) return this.runtime.forcePose;
    if (this.runtime.drag) return "drag";
    if (this.life.state.travel) return "travel";
    if (this.life.state.sick) return "sick";
    if (this.runtime.waiting) return "wait";
    if (this.runtime.angryUntil > now) return "angry";
    if (this.life.state.sleeping) return "sleep";
    if (this.runtime.celebrateUntil > now) return "celebrate";
    if (this.runtime.errorUntil > now) return "sweat";
    if (this.runtime.eatUntil > now) return "eat";
    if (this.runtime.working) return "type";
    if (this.runtime.waveUntil > now) return "wave";
    if (this.runtime.pettedUntil > now) return "petted";
    if (this.runtime.pokeUntil > now) return "poke";
    if (this.life.state.hunger < 18) return "hungry";
    if (performance.now() < this.runtime.blinkUntil) return "blink";
    return "idle";
  }

  isBusyAnimating(now) {
    if (this.runtime.particles.length > 0) return true;
    if (this.runtime.working || this.runtime.waiting) return true;
    if (this.runtime.celebrateUntil > now || this.runtime.errorUntil > now) return true;
    if (this.runtime.eatUntil > now || this.runtime.pettedUntil > now || this.runtime.pokeUntil > now || this.runtime.waveUntil > now) return true;
    if (this.life.state.angryUntil > now) return true;
        return false;
  }

  /* ---------------------------------------------------------------- */
  /* Pointer + drag                                                   */
  /* ---------------------------------------------------------------- */

  bindPointer() {
    const onMove = (event) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.inside = true;
      const overUi = Boolean(event.target.closest?.(".panel, .bubble, .travel-note"));
      const overPet = this.hitTest(event.clientX, event.clientY) !== null;
      this.setInteractive(overUi || overPet || this.runtime.menuOpen || this.runtime.drag);
      if (this.dragStart && !this.runtime.drag) {
        const dx = event.clientX - this.dragStart.x;
        const dy = event.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 7) this.beginDrag(event);
      }
      if (!this.runtime.drag && this.hitTest(event.clientX, event.clientY) === "head") {
        // Stroking does not require holding the mouse button: moving the
        // cursor back and forth across the head is itself the petting gesture.
        if (!this.stroke) this.stroke = { lastX: event.clientX, dir: 0, changes: 0, at: Date.now() };
        this.trackStroke(event.clientX);
      }
    };
    const onLeave = () => {
      this.pointer.inside = false;
      this.stroke = null;
      if (!this.runtime.drag) this.setInteractive(false);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave, { passive: true });

    const onDown = (event) => {
      if (event.button !== 0) return;
      if (this.runtime.travel) return;
      const region = this.hitTest(event.clientX, event.clientY);
      if (!region) return;
      event.preventDefault();
      this.setInteractive(true);
      this.host.touch?.();
      this.dragStart = {
        x: event.clientX,
        y: event.clientY,
        region,
        at: Date.now(),
        screenX: event.screenX,
        screenY: event.screenY,
      };
      this.stroke = { lastX: event.clientX, dir: 0, changes: 0, at: Date.now() };
    };
    window.addEventListener("pointerdown", onDown, { passive: false });

    const finish = (event) => {
      if (!this.dragStart) return;
      const start = this.dragStart;
      this.dragStart = null;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (this.runtime.drag) {
        this.runtime.drag = false;
        this.host.dragEnd?.({ pointerX: event.clientX, pointerY: event.clientY });
        this.dragStart = null;
        return;
      }
      if (moved > 7) return;
      this.handleClick(start.region, event);
    };
    window.addEventListener("pointerup", finish, { passive: true });
    window.addEventListener("pointercancel", finish, { passive: true });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.dismissAll();
    });
    // 菜单、状态卡、设置、日记、明信片：一出现就挪到宠物旁边；开着的时候窗口拿焦点，点别处（失焦）就收起
    const observer = new MutationObserver(() => this.onPanelsChanged());
    for (const id of ["menu", "status-card", "settings", "diary", "postcard"]) observer.observe($(id), { attributes: true, attributeFilter: ["hidden"] });

    window.addEventListener("dblclick", (event) => {
      const region = this.hitTest(event.clientX, event.clientY);
      if (!region) return;
      event.preventDefault();
      if (this.pendingClick) {
        clearTimeout(this.pendingClick.timer);
        this.pendingClick = null;
      }
      this.lastClick = { at: 0, region: null };
      this.openPanel("card");
    });
  }

  trackStroke(x) {
    if (!this.stroke) return;
    const now = Date.now();
    if (now - this.stroke.at > 2200) {
      // A pause over the head ends the previous stroke gesture.
      this.stroke.changes = 0;
      this.stroke.at = now;
    }
    const dir = Math.sign(x - this.stroke.lastX);
    if (dir !== 0 && this.stroke.dir !== 0 && dir !== this.stroke.dir) {
      this.stroke.changes += 1;
      if (this.stroke.changes >= 2) {
        this.stroke.changes = 0;
        this.stroke.at = now;
        if (!this.life.state.sleeping) {
          this.doPet(true);
          this.say("呼噜呼噜…");
        }
      }
    }
    if (dir !== 0) this.stroke.dir = dir;
    this.stroke.lastX = x;
  }

  handleClick(region, event) {
    this.host.touch?.();
    if (this.runtime.waiting && (region === "head" || region === "body")) {
      this.jumpToWaiting();
      return;
    }
    if (region === "head" || region === "body") {
      // Delay the single-click action so a double click can open the card.
      const now = Date.now();
      if (this.lastClick.region === region && now - this.lastClick.at < 320) return;
      this.lastClick = { at: now, region };
      if (this.pendingClick) clearTimeout(this.pendingClick.timer);
      this.pendingClick = {
        region,
        timer: setTimeout(() => {
          this.pendingClick = null;
          if (region === "head") this.doPet(false);
          else this.doPoke();
        }, 230),
      };
    }
  }

  beginDrag(event) {
    if (!this.dragStart || this.runtime.drag) return;
    this.runtime.drag = true;
    this.setInteractive(true);
    this.host.dragStart?.({
      offsetX: this.dragStart.x,
      offsetY: this.dragStart.y,
    });
    this.applyMode("drag", 300);
  }

  hitTest(clientX, clientY) {
    if (this.runtime.travel) return null;
    const b = this.art.bounds;
    if (!b) return null;
    const x = clientX - this.stagePos.x;
    const y = clientY - this.stagePos.y;
    if (x < b.left || x > b.right || y < b.top - 4 || y > b.bottom + 4) return null;
    if (this.mode === "perch") return "head";
    return y < b.split ? "head" : "body";
  }

  isOverPet(x, y) {
    return this.hitTest(x, y) !== null;
  }

  /** 把面板放在宠物旁边：优先左边，底部和脚齐平，永不出窗口 */
  placeBeside(el) {
    if (!el || el.hidden) return;
    el.style.transform = "none";
    el.style.right = "auto";
    el.style.bottom = "auto";
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const b = this.art.bounds ?? { left: STAGE_W / 2 - 44, right: STAGE_W / 2 + 44, top: 130, bottom: 250 };
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const { x: ox, y: oy } = this.stagePos;
    // 屏幕边界换算到 stage 坐标
    const leftLimit = -ox + 8;
    const rightLimit = -ox + viewW - w - 8;
    const topLimit = -oy + 8;
    const bottomLimit = -oy + viewH - h - 8;
    const roomLeft = b.left + ox;
    const roomRight = viewW - (b.right + ox);
    const besideRight = roomRight >= w + 12 || (roomRight > roomLeft && roomRight > w * 0.55);
    const x = besideRight ? b.right + 12 : b.left - 12 - w;
    // 站在底边时，面板跟脚齐平往上升，而不是贴着头像气泡一样往下掉
    const top = Math.min(b.bottom - h - 6, bottomLimit);
    el.style.left = `${Math.round(clamp(x, leftLimit, rightLimit))}px`;
    el.style.top = `${Math.round(clamp(top, topLimit, bottomLimit))}px`;
  }

  onPanelsChanged() {
    for (const id of ["menu", "status-card", "settings", "diary", "postcard"]) {
      const el = $(id);
      if (!el.hidden && el.dataset.placed !== "1") { this.placeBeside(el); el.dataset.placed = "1"; }
      if (el.hidden) el.dataset.placed = "";
    }
    this.host.setModal?.(this.uiOpen());
  }

  /** 收起所有菜单和面板（Esc、点了窗口外面） */
  dismissAll() {
    if (this.runtime.menuOpen) { $("menu").hidden = true; this.runtime.menuOpen = false; }
    if (this.runtime.cardOpen || this.runtime.settingsOpen || this.runtime.diaryOpen) this.openPanel(null);
    const postcard = $("postcard");
    if (!postcard.hidden) { postcard.hidden = true; this.runtime.postcardOpen = false; this.life.dismissPostcard(); this.saveNow(); }
    this.setInteractive(this.isOverPet(this.pointer.x, this.pointer.y));
  }

  uiOpen() {
    return this.runtime.menuOpen || this.runtime.cardOpen || this.runtime.settingsOpen || this.runtime.diaryOpen || this.runtime.postcardOpen;
  }

  setInteractive(value) {
    if (this.interactive === value) return;
    this.interactive = value;
    this.host.setInteractive?.(value);
  }

  /* ---------------------------------------------------------------- */
  /* Greeting                                                         */
  /* ---------------------------------------------------------------- */

  showGreeting() {
    if (this.runtime.greetingShown) return;
    this.runtime.greetingShown = true;
    if (!this.config.enabled) return;
    if (this.life.state.travel) return;
    const greeting = this.life.greet();
    this.runtime.waveUntil = Date.now() + 2600;
    if (greeting) setTimeout(() => this.say(greeting), 900);
    const s = this.life.state;
    if (s.sick) setTimeout(() => this.say("我有点不舒服…"), 2600);
    else if (s.hunger < 20) setTimeout(() => this.say("肚子有点饿…"), 2600);
    else if (s.totals.turns === 0) setTimeout(() => this.say("第一次见面，请多关照。"), 2600);
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

  const app = new PetApp();
  app.setStagePos = (x, y) => { app.stagePos = { x, y }; };
  app.start().catch((error) => {
    console.error("[pet] failed to start", error);
    try { host.log?.(String(error?.stack || error)); } catch { /* ignore */ }
  });
  return app;
}
