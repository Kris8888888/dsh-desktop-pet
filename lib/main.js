/**
 * Client half of the desktop pet.
 *
 * One overlay layer draws the pet on the frame floor, one settings page owns
 * its knobs, and a small engine turns the running session into pet events.
 */
import { React, css } from "runtime";
import { mountPet } from "./layer.js";
import { installEngine } from "./engine.js";
import { createSettingsView } from "./settings.js";
import { createHost } from "./host.js";

const h = React.createElement;

/** 桌面浮窗版的桥（window.__dshPet）包成设置页 / 引擎要的 host 接口 */
function createNativeHost(bridge, ctx) {
  let config = { enabled: true, character: "whale", notify: true, hearts: true, size: 1, skin: { whale: "classic", crab: "classic" } };
  const listeners = new Set();
  const publish = (next) => {
    if (!next) return;
    config = { ...config, ...next };
    for (const l of listeners) l(config);
  };
  bridge.getState?.().then((s) => publish(s?.config)).catch(() => {});
  bridge.onState?.((s) => publish(s?.config));
  bridge.onJump?.((sessionId) => {
    try {
      const target = sessionId ?? (ctx.uiSession.current.getSnapshot()?.sessionId ?? null);
      if (target) { ctx.layout.selectPanel(null); ctx.uiWorkspace.openSession(target); }
    } catch { /* navigation is best-effort */ }
  });
  return {
    getConfig: () => config,
    onConfig(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setConfig(patch) {
      config = { ...config, ...patch };
      bridge.setConfig?.(patch).then(publish).catch(() => {});
      return config;
    },
    emit(event) {
      if (event?.type === "dsh" && event.kind) {
        const { type, ...rest } = event;
        bridge.event?.(rest);
      }
    },
    recall() { bridge.event?.({ kind: "recall" }); },
    reset() { bridge.event?.({ kind: "reset" }); },
  };
}

/*
 * 设置页左栏的图标：DSH 只给自己的几个分区配图标，插件分区一律是齿轮，
 * settings.section 也没有 icon 字段。跟插件市场一样：找到标题等于「桌面宠物」的那一行，
 * 用 CSS 把齿轮藏掉、画一只线条小鲸鱼（颜色跟随文字）。
 */
const NAV_LABEL = "桌面宠物";
const NAV_MARK = "data-dsh-pet-nav-icon";
const NAV_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#000" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M11.9 7.6c.3 2.9-2 5.1-5 5.1-2.9 0-5-1.9-5-4.4C1.9 5.9 3.9 4.2 6.4 4.2c1.9 0 3.2.8 4 2"/><path d="M10.4 6.2 11.6 3.3"/><path d="M11.6 3.3c-.5-.8-1.4-1.1-2.2-.8M11.6 3.3c.6-.6 1.5-.8 2.3-.4"/><path d="M2.6 9.4c1.7.1 3.4.9 4.5 2.6"/><circle cx="8.9" cy="7.9" r=".7" fill="#000" stroke="none"/></svg>';

function installNavIcon(ctx) {
  ctx.effect(() => {
    const url = `data:image/svg+xml,${encodeURIComponent(NAV_ICON_SVG)}`;
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-desktop-pet";
    tag.textContent = `[${NAV_MARK}] > svg { display: none; }
[${NAV_MARK}]::before { content: ''; flex: none; width: 16px; height: 16px; background-color: currentColor;
  -webkit-mask: url("${url}") center / 16px 16px no-repeat; mask: url("${url}") center / 16px 16px no-repeat; }`;
    document.head.appendChild(tag);
    let queued = false;
    const sync = () => {
      queued = false;
      for (const row of document.querySelectorAll('[role="dialog"] nav button')) {
        if (row.textContent.trim() === NAV_LABEL) row.setAttribute(NAV_MARK, "");
      }
    };
    const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(sync); } });
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      for (const row of document.querySelectorAll(`[${NAV_MARK}]`)) row.removeAttribute(NAV_MARK);
      tag.remove();
    };
  }, "dsh-desktop-pet: settings nav icon");
}

export const plugin = {
  name: "dsh-desktop-pet",
  inject: ["slots", "uiSession", "sessions", "uiWorkspace", "layout"],
  apply(ctx) {
    installNavIcon(ctx);
    ctx.effect(() => {
      const style = document.createElement("style");
      style.dataset.plugin = "dsh-desktop-pet";
      style.textContent = css;
      document.head.appendChild(style);
      return () => style.remove();
    }, "dsh-desktop-pet: styles");

    // 装了「桌面浮窗版」（改过 DSH 安装包，页面里有 window.__dshPet）时，宠物由浮窗画，
    // 这里只把会话事件和设置转给它，不再在页面里另画一只
    const bridge = typeof window !== "undefined" ? window.__dshPet : undefined;
    if (bridge) {
      const native = createNativeHost(bridge, ctx);
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "desktop-pet",
        order: 58,
        label: () => "桌面宠物",
      }, createSettingsView(native)));
      installEngine(ctx, native);
      return;
    }

    const host = createHost({
      onJump(sessionId) {
        try {
          const target = sessionId ?? (ctx.uiSession.current.getSnapshot()?.sessionId ?? null);
          if (!target) return;
          ctx.layout.selectPanel(null);
          ctx.uiWorkspace.openSession(target);
        } catch {
          /* navigation is best-effort */
        }
      },
    });

    ctx.effect(() => () => host.flush(), "dsh-desktop-pet: flush state");

    function PetLayer() {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const holder = ref.current;
        if (!holder) return () => {};
        const layer = mountPet({ host });
        holder.appendChild(layer.root);
        return () => {
          layer.dispose();
          layer.root.remove();
        };
      }, []);
      return h("div", {
        ref,
        style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40 },
        "aria-hidden": true,
      });
    }

    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: "desktop-pet",
      order: 40,
      label: () => "桌面宠物",
    }, PetLayer));

    const PetSettings = createSettingsView(host);
    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section",
      id: "desktop-pet",
      order: 58,
      label: () => "桌面宠物",
    }, PetSettings));

    installEngine(ctx, host);
  },
};
