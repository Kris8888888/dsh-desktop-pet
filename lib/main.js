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

export const plugin = {
  name: "dsh-desktop-pet",
  inject: ["slots", "uiSession", "sessions", "uiWorkspace", "layout"],
  apply(ctx) {
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
