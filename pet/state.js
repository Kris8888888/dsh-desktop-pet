import { pickPlace, placeById } from "./places.js";

const HOUR = 3600_000;
const MINUTE = 60_000;
const DAY = 86_400_000;

export const DEFAULT_CONFIG = {
  enabled: true,
  character: "whale",
  notify: true,
  hearts: true,
  size: 1,
  skin: { whale: "classic", crab: "classic" },
};

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pick(list, random = Math.random) {
  return list[Math.floor(random() * list.length)];
}

export function createState(now = Date.now()) {
  return {
    v: 1,
    character: "whale",
    bornAt: now,
    createdAt: now,
    lastTickAt: now,
    hunger: 82,
    mood: 78,
    energy: 82,
    health: 100,
    intimacy: 3,
    sick: false,
    sickAt: null,
    sleeping: false,
    sleepSince: null,
    manualSleepUntil: 0,
    travel: null,
    postcard: null,
    lastPetAt: 0,
    lastPokeAt: 0,
    pokeTimes: [],
    angryUntil: 0,
    snacks: { date: dayKey(now), left: 3 },
    reminders: {},
    today: {
      date: dayKey(now),
      tokens: 0,
      tasks: 0,
      pets: 0,
      pokes: 0,
      lateNight: false,
      workMs: 0,
      travel: null,
    },
    totals: {
      tokens: 0,
      turns: 0,
      tasks: 0,
      pets: 0,
      pokes: 0,
      snacks: 0,
      medicines: 0,
      travels: 0,
    },
    diary: [],
    position: null,
    lastSeenAt: now,
    lastInteractionAt: now,
    greetingDay: "",
    achievements: [],
  };
}

/**
 * The pet's persistent life. Pure-ish: `tick` mutates and returns a list of
 * things the renderer should react to (bubbles, notifications, postcards).
 */
export class PetLife {
  constructor(raw, now = Date.now()) {
    const base = createState(now);
    this.state = mergeState(base, raw);
    this.state.lastTickAt = now;
    this.events = [];
    this.lastReminderAt = 0;
    this.random = Math.random;
    this.speed = 1;
  }

  get character() {
    return this.state.character;
  }

  get isTraveling() {
    return this.state.travel !== null;
  }

  snapshot() {
    return this.state;
  }

  touch(now = Date.now()) {
    this.state.lastInteractionAt = now;
    this.state.lastSeenAt = now;
  }

  tick(now, ctx = {}) {
    const s = this.state;
    const dt = clamp((now - (s.lastTickAt || now)) / 1000, 0, 300);
    s.lastTickAt = now;
    if (dt <= 0) return [];

    const out = [];
    const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
    const lateNight = hour >= 23.5 || hour < 6;

    // Roll the day.
    if (s.today.date !== dayKey(now)) {
      out.push({ type: "diary", entry: this.finishDay(s.today, now) });
      s.today = {
        date: dayKey(now),
        tokens: 0,
        tasks: 0,
        pets: 0,
        pokes: 0,
        lateNight: false,
        workMs: 0,
        travel: null,
      };
    }
    if (s.snacks.date !== dayKey(now)) {
      s.snacks = { date: dayKey(now), left: 3 };
    }

    const sleeping = this.shouldSleep(now, ctx, hour);
    if (sleeping !== s.sleeping) {
      s.sleeping = sleeping;
      s.sleepSince = sleeping ? now : null;
      out.push({ type: sleeping ? "sleep" : "wake" });
    }

    // Hunger: about 9 points an hour while awake, 4 while asleep.
    const hungerRate = s.sleeping ? 4 / HOUR : 9 / HOUR;
    s.hunger = clamp(s.hunger - hungerRate * dt * 1000, 0, 100);

    // Energy.
    if (s.sleeping) s.energy = clamp(s.energy + (18 / HOUR) * dt * 1000, 0, 100);
    else if (ctx.working) s.energy = clamp(s.energy - (10 / HOUR) * dt * 1000, 0, 100);
    else s.energy = clamp(s.energy + (2 / HOUR) * dt * 1000, 0, 100);

    // Mood drifts toward 60, dragged down by empty stomach / sickness / pokes.
    const moodTarget = s.sick ? 30 : s.hunger < 18 ? 42 : 62;
    s.mood += (moodTarget - s.mood) * 0.012 * dt;
    if (s.angryUntil > now) s.mood = clamp(s.mood - 0.02 * dt, 0, 100);

    // Sickness after two hours empty; recovery when fed and rested.
    if (s.hunger <= 0.5) {
      if (s.sickAt === null) s.sickAt = now;
      else if (!s.sick && now - s.sickAt > 2 * HOUR) {
        s.sick = true;
        s.health = clamp(s.health - 10, 0, 100);
        out.push({ type: "sick" });
      }
    } else {
      s.sickAt = null;
    }
    if (s.sick) {
      s.health = clamp(s.health - (1.4 / HOUR) * dt * 1000, 0, 100);
      s.mood = clamp(s.mood - (2 / HOUR) * dt * 1000, 0, 100);
    } else if (s.hunger > 35 && s.energy > 30) {
      s.health = clamp(s.health + (2 / HOUR) * dt * 1000, 0, 100);
    }

    // Intimacy slowly grows while it is around and cared for.
    if (!s.sick && s.hunger > 25) s.intimacy = clamp(s.intimacy + (0.6 / DAY) * dt * 1000, 0, 100);

    // Travel return.
    if (s.travel && now >= s.travel.returnAt) {
      const place = placeById(s.travel.placeId);
      s.travel = null;
      s.postcard = {
        placeId: place.id,
        place: place.name,
        country: place.country,
        note: place.note,
        returnedAt: now,
        seen: false,
      };
      s.hunger = clamp(s.hunger - 12, 0, 100);
      s.energy = clamp(s.energy - 10, 0, 100);
      s.mood = clamp(s.mood + 14, 0, 100);
      s.intimacy = clamp(s.intimacy + 2, 0, 100);
      s.totals.travels += 1;
      out.push({ type: "postcard", postcard: s.postcard, place });
    }

    // Late-night flag and reminders.
    if (lateNight) s.today.lateNight = true;
    if (ctx.working) s.today.workMs += dt * 1000;

    const reminders = this.reminders(now, ctx, hour);
    out.push(...reminders);

    // Idle thoughts.
    if (this.canChatter(now, ctx) && this.random() < dt / 42) {
      out.push({ type: "thought", text: this.thought(now, ctx, hour) });
      this.lastReminderAt = now;
    }

    return out;
  }

  shouldSleep(now, ctx, hour) {
    const s = this.state;
    if (s.manualSleepUntil > now) return true;
    if (ctx.waiting) return false;
    if (s.sick && ctx.idleSeconds > 300) return true;
    const late = hour >= 23.5 || hour < 6.5;
    if (late && !ctx.working) return true;
    if (ctx.idleSeconds > 600) return true;
    if (s.energy < 8) return true;
    return false;
  }

  canChatter(now, ctx) {
    if (this.state.sleeping || this.isTraveling) return false;
    if (ctx.working || ctx.waiting) return false;
    if (now - this.lastReminderAt < 100_000) return false;
    if (now - this.state.lastInteractionAt < 20_000) return false;
    return true;
  }

  thought(now, ctx, hour) {
    const s = this.state;
    if (s.sick) return pick(["我有点不舒服…", "药在右键菜单里。", "想被你摸摸，但先吃药。"], this.random);
    if (s.hunger < 20) return pick(["肚子有点叫…", "可以喂我一点 token 吗？", "我不挑食，真的。"], this.random);
    if (s.angryUntil > now) return pick(["哼。", "还在生气。", "先别碰我。"], this.random);
    if (s.energy < 25) return pick(["有点困了…", "想打个盹。", "眼皮好重。"], this.random);
    if (hour >= 12 && hour < 13.5) return pick(["午饭时间到。", "你也该吃饭了。", "别又拿咖啡当午饭。"], this.random);
    if (hour >= 18 && hour < 19.5) return pick(["今天差不多了吧？", "下班记得站起来。", "天要黑了。"], this.random);
    return pick([
      "你的光标在闪。",
      "我在看云。",
      "刚才那行代码好长。",
      "要不要摸摸我？",
      "打字声很好听。",
      "我刚刚吃掉了一小口 token。",
      "窗外的光变了。",
      "DeepSeek 的鲸鱼今天也很努力。",
    ], this.random);
  }

  reminders(now, ctx, hour) {
    const s = this.state;
    const out = [];
    const key = dayKey(now);
    const once = (id, condition, text) => {
      if (s.reminders[id] === key || !condition) return;
      s.reminders[id] = key;
      out.push({ type: "reminder", id, text, notify: true });
    };

    once("lunch", hour >= 12 && hour < 13.5, "到饭点啦。别只喂我，也喂喂你自己。");
    once("offwork", hour >= 18.5 && hour < 20, "下班啦，今天也辛苦你了。");
    once("late", hour >= 23.5 && hour < 26, "很晚啦，剩下的明天再改也来得及。");

    // Stand-up reminder: after 50 minutes of continuous work, once per 50 min.
    if (ctx.working) {
      const last = s.reminders.standAt ?? 0;
      if (now - last > 50 * MINUTE) {
        s.reminders.standAt = now;
        out.push({
          type: "reminder",
          id: "stand",
          text: pick(["坐太久了，站起来伸个懒腰吧。", "去倒杯水，顺便看看远处。", "肩膀是不是又耸起来了？"], this.random),
          notify: true,
        });
      }
    } else if (now - (s.reminders.standAt ?? 0) > 10 * MINUTE) {
      s.reminders.standAt = now;
    }

    return out;
  }

  feedTokens(tokens, now = Date.now()) {
    const s = this.state;
    const n = Math.max(0, Math.round(tokens));
    if (n <= 0) return null;
    const bite = clamp(2 + Math.sqrt(n) / 30, 2, 36);
    s.hunger = clamp(s.hunger + bite, 0, 100);
    s.mood = clamp(s.mood + Math.min(6, bite * 0.35), 0, 100);
    s.today.tokens += n;
    s.totals.tokens += n;
    s.totals.turns += 1;
    s.lastSeenAt = now;
    if (s.sleeping && s.energy > 20) {
      s.sleeping = false;
      s.sleepSince = null;
    }
    return bite;
  }

  pet(now = Date.now(), strong = false) {
    const s = this.state;
    if (s.angryUntil > now) return { ok: false, reason: "angry" };
    if (s.sleeping) {
      s.sleeping = false;
      s.sleepSince = null;
      return { ok: false, reason: "woke" };
    }
    const gain = strong ? 1.8 : 1;
    s.mood = clamp(s.mood + (strong ? 5 : 2.4) * gain, 0, 100);
    s.intimacy = clamp(s.intimacy + (strong ? 1.2 : 0.5), 0, 100);
    s.lastPetAt = now;
    s.lastInteractionAt = now;
    s.today.pets += strong ? 2 : 1;
    s.totals.pets += strong ? 2 : 1;
    return { ok: true };
  }

  poke(now = Date.now()) {
    const s = this.state;
    s.lastPokeAt = now;
    s.today.pokes += 1;
    s.totals.pokes += 1;
    s.pokeTimes = [...s.pokeTimes.filter((t) => now - t < 6000), now];
    s.mood = clamp(s.mood - 1.4, 0, 100);
    if (s.pokeTimes.length >= 3) {
      s.angryUntil = now + 9000;
      s.pokeTimes = [];
      s.mood = clamp(s.mood - 8, 0, 100);
      return { ok: true, angry: true };
    }
    if (s.sleeping) {
      s.sleeping = false;
      s.sleepSince = null;
      s.angryUntil = now + 5000;
      return { ok: true, angry: true, woke: true };
    }
    return { ok: true };
  }

  snack(now = Date.now()) {
    const s = this.state;
    if (s.snacks.left <= 0) return { ok: false, reason: "empty" };
    s.snacks.left -= 1;
    s.hunger = clamp(s.hunger + 13, 0, 100);
    s.mood = clamp(s.mood + 7, 0, 100);
    s.totals.snacks += 1;
    s.lastInteractionAt = now;
    s.lastSeenAt = now;
    return { ok: true, left: s.snacks.left };
  }

  medicine(now = Date.now()) {
    const s = this.state;
    if (!s.sick) return { ok: false, reason: "not-sick" };
    if (s.hunger < 15) return { ok: false, reason: "hungry" };
    s.sick = false;
    s.sickAt = null;
    s.health = clamp(s.health + 32, 0, 100);
    s.mood = clamp(s.mood + 6, 0, 100);
    s.totals.medicines += 1;
    s.lastInteractionAt = now;
    return { ok: true };
  }

  toggleSleep(now = Date.now(), force) {
    const s = this.state;
    if (force === true) {
      s.sleeping = true;
      s.sleepSince = now;
      s.manualSleepUntil = now + 25 * MINUTE;
      return true;
    }
    if (s.sleeping) {
      s.sleeping = false;
      s.sleepSince = null;
      s.manualSleepUntil = 0;
      return false;
    }
    s.sleeping = true;
    s.sleepSince = now;
    s.manualSleepUntil = now + 25 * MINUTE;
    return true;
  }

  startTravel(now = Date.now(), durationMinutes) {
    const s = this.state;
    if (s.travel) return { ok: false, reason: "traveling" };
    if (s.sick) return { ok: false, reason: "sick" };
    const place = pickPlace();
    const minutes = durationMinutes ?? (40 + Math.floor(this.random() * 81));
    const travel = {
      placeId: place.id,
      place: place.name,
      country: place.country,
      departAt: now,
      returnAt: now + minutes * MINUTE,
    };
    s.travel = travel;
    s.today.travel = place.name;
    s.mood = clamp(s.mood + 5, 0, 100);
    s.lastInteractionAt = now;
    return { ok: true, travel, place };
  }

  callBack(now = Date.now()) {
    const s = this.state;
    if (!s.travel) return false;
    s.travel.returnAt = now;
    return true;
  }

  dismissPostcard() {
    const s = this.state;
    if (s.postcard) s.postcard.seen = true;
  }

  finishDay(today, now) {
    const s = this.state;
    const entry = {
      date: today.date,
      tokens: today.tokens,
      tasks: today.tasks,
      pets: today.pets,
      pokes: today.pokes,
      lateNight: today.lateNight,
      travel: today.travel,
      mood: Math.round(s.mood),
      text: "",
      createdAt: now,
    };
    entry.text = diaryText(entry);
    s.diary = [entry, ...s.diary].slice(0, 60);
    return entry;
  }

  completeTask(now = Date.now()) {
    const s = this.state;
    s.today.tasks += 1;
    s.totals.tasks += 1;
    s.intimacy = clamp(s.intimacy + 0.4, 0, 100);
    s.lastSeenAt = now;
  }

  greet(now = Date.now()) {
    const s = this.state;
    const key = dayKey(now);
    if (s.greetingDay === key) return null;
    s.greetingDay = key;
    const hour = new Date(now).getHours();
    const greeting = hour < 6
      ? "这么晚还在呀。我陪你一会儿。"
      : hour < 11
        ? "早安，今天也一起加油。"
        : hour < 14
          ? "中午好，记得吃饭。"
          : hour < 18
            ? "下午好，喝口水吧。"
            : hour < 22
              ? "晚上好，今天过得怎么样？"
              : "夜深了，别太累。";
    return greeting;
  }

  daysTogether(now = Date.now()) {
    return Math.max(1, Math.floor((now - this.state.bornAt) / DAY) + 1);
  }
}

function mergeState(base, raw) {
  if (!raw || typeof raw !== "object") return base;
  const result = { ...base };
  for (const key of Object.keys(base)) {
    if (raw[key] === undefined) continue;
    const value = raw[key];
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      result[key] = { ...base[key], ...value };
    } else {
      result[key] = value;
    }
  }
  // Keep arrays shallow-copied.
  for (const key of ["diary", "pokeTimes", "achievements"]) {
    if (Array.isArray(raw[key])) result[key] = raw[key].slice();
  }
  if (!result.today || !result.today.date) result.today = base.today;
  if (!result.snacks || !result.snacks.date) result.snacks = base.snacks;
  if (!result.reminders) result.reminders = {};
  return result;
}

export function diaryText(entry) {
  const bits = [];
  if (entry.tokens > 0) bits.push(`吃掉 ${formatTokens(entry.tokens)} token`);
  else bits.push("今天没怎么吃东西");
  if (entry.tasks > 0) bits.push(`陪你做完 ${entry.tasks} 件事`);
  if (entry.pets > 0) bits.push(`被摸了 ${entry.pets} 次`);
  if (entry.pokes > 0) bits.push(`被戳了 ${entry.pokes} 次`);
  if (entry.travel) bits.push(`去了${entry.travel}`);
  if (entry.lateNight) bits.push("又熬到了很晚");
  else bits.push("有好好睡觉");
  const moodLine = entry.mood >= 75 ? "心情亮亮的。" : entry.mood >= 50 ? "心情还不错。" : "有点想你多陪陪我。";
  return `${bits.join("，")}。${moodLine}`;
}
