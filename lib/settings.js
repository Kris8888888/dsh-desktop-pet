/**
 * Settings → 桌面宠物.
 *
 * Same knobs as the in-pet panel, plus a status line: the page is the only
 * place that knows whether the pet is actually running.
 */
import { React } from "runtime";

const h = React.createElement;

const S = {
  page: { padding: "22px 24px 40px", maxWidth: 680, color: "var(--dsw-alias-label-primary)", fontSize: 13, lineHeight: 1.55 },
  head: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  title: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: "26px" },
  sub: { margin: "2px 0 0", color: "var(--dsw-alias-label-secondary)", fontSize: 12 },
  card: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", borderRadius: 12, padding: "4px 16px", marginBottom: 12 },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderTop: "1px solid var(--dsw-alias-border-l1)" },
  rowFirst: { borderTop: "none" },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: 600, fontSize: 13 },
  rowDesc: { color: "var(--dsw-alias-label-secondary)", fontSize: 11.5, marginTop: 2 },
  switch: (on) => ({
    width: 42, height: 24, borderRadius: 999, border: "none", padding: 2, cursor: "pointer",
    background: on ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-border-l3)",
    display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .18s",
  }),
  knob: { width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)" },
  chips: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" },
  chip: (on) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, cursor: "pointer",
    border: "1px solid " + (on ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-border-l2)"),
    background: on ? "color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)" : "transparent",
    color: "inherit", font: "inherit", fontSize: 12,
  }),
  dot: (color) => ({ width: 16, height: 16, borderRadius: "50%", background: color, boxShadow: "inset 0 -2px 0 rgba(0,0,0,.18)" }),
  note: { color: "var(--dsw-alias-label-secondary)", fontSize: 11.5, margin: "4px 0 0" },
  bar: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 },
  btn: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", font: "inherit", fontSize: 12 },
  badge: (on) => ({ marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 999, color: on ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-secondary)", background: on ? "color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)" : "var(--dsw-alias-bg-layer-2)" }),
  error: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12, marginTop: 8 },
};

// keep in step with pet/art.js SIZES and pet/sprite.js SKINS
const SIZE_OPTIONS = [[0.8, "小"], [1, "中"], [1.3, "大"], [1.7, "特大"]];
const SKIN_OPTIONS = {
  whale: [["classic", "经典蓝", "#2563D8"], ["deep", "深海", "#0F3B68"], ["light", "浅蓝", "#C7E6FE"]],
  crab: [["classic", "经典橙", "#D97757"], ["night", "夜色", "#4B4F5E"], ["peach", "蜜桃", "#F2B097"]],
};

function Switch({ on, onChange, label }) {
  return h("button", {
    type: "button", role: "switch", "aria-checked": on, "aria-label": label, style: S.switch(on), onClick: () => onChange(!on),
  }, h("span", { style: S.knob }));
}

function Row({ title, desc, children, first }) {
  return h("div", { style: first ? { ...S.row, ...S.rowFirst } : S.row },
    h("div", { style: S.rowText },
      h("div", { style: S.rowTitle }, title),
      desc ? h("div", { style: S.rowDesc }, desc) : null),
    children);
}

export function createSettingsView(host) {
  return function PetSettings() {
    const [config, setConfig] = React.useState(() => host.getConfig());
    const [error, setError] = React.useState("");

    React.useEffect(() => host.onConfig((next) => setConfig({ ...next })), []);

    const update = (patch) => {
      setError("");
      try {
        setConfig({ ...host.setConfig(patch) });
      } catch (reason) {
        setError(String(reason?.message ?? reason));
      }
    };

    const character = config.character === "crab" ? "crab" : "whale";

    return h("div", { style: S.page },
      h("div", { style: S.head },
        h("div", { style: S.rowText },
          h("h2", { style: S.title }, "桌面宠物"),
          h("p", { style: S.sub }, "一只在你窗口底边散步的 DeepSeek 小鲸鱼，或者 Claude Code 的像素小螃蟹。它吃 token、写日记、会出门旅行带明信片回来。")),
        h("span", { style: S.badge(config.enabled) }, config.enabled ? "运行中" : "已关闭")),

      h("div", { style: S.card },
        h(Row, { title: "启用桌面宠物", desc: "关掉后宠物立刻消失，也不再跑任何宠物代码。", first: true },
          h(Switch, { on: config.enabled, label: "启用桌面宠物", onChange: (value) => update({ enabled: value }) })),
        h(Row, { title: "角色", desc: "换角色会立刻重绘，状态和日记都保留。" },
          h("div", { style: S.chips },
            h("button", { type: "button", style: S.chip(character !== "crab"), onClick: () => update({ character: "whale" }) },
              h("span", { style: S.dot("#2563D8") }), "DeepSeek 小鲸鱼"),
            h("button", { type: "button", style: S.chip(character === "crab"), onClick: () => update({ character: "crab" }) },
              h("span", { style: S.dot("#D97757") }), "像素小螃蟹"))),
        h(Row, { title: "大小", desc: "「中」是默认大小。" },
          h("div", { style: S.chips },
            ...SIZE_OPTIONS.map(([value, label]) => h("button", { type: "button", key: label, style: S.chip(Number(config.size ?? 1) === value), onClick: () => update({ size: value }) }, label)))),
        h(Row, { title: "配色", desc: "每个角色单独记住自己的配色。" },
          h("div", { style: S.chips },
            ...SKIN_OPTIONS[character].map(([key, label, color]) => {
              const on = (config.skin?.[character] ?? "classic") === key;
              return h("button", { type: "button", key, style: S.chip(on), onClick: () => update({ skin: { ...(config.skin ?? {}), [character]: key } }) },
                h("span", { style: S.dot(color) }), label);
            }))),
        h(Row, { title: "到点提醒", desc: "中午、久坐、下班、深夜会提醒你；需要浏览器允许通知。" },
          h(Switch, { on: config.notify, label: "到点提醒", onChange: (value) => update({ notify: value }) })),
        h(Row, { title: "爱心特效", desc: "被摸头时冒小爱心。低性能机器可以关掉。" },
          h(Switch, { on: config.hearts, label: "爱心特效", onChange: (value) => update({ hearts: value }) }))),

      h("div", { style: S.bar },
        h("button", { type: "button", style: S.btn, onClick: () => host.emit({ type: "dsh", kind: "greet" }) }, "让它打个招呼"),
        h("button", { type: "button", style: S.btn, onClick: () => { host.recall(); host.emit({ type: "dsh", kind: "recall" }); } }, "回到右下角"),
        h("button", { type: "button", style: S.btn, onClick: () => { host.reset(); host.emit({ type: "reset" }); } }, "重置数据")),
      h("p", { style: S.note }, "双击宠物看状态卡；右键可以喂零食、哄睡、出门玩。出门 40–120 分钟后会带一张明信片回来。状态和日记都存在本机浏览器里，换设备不会同步。"),
      error ? h("p", { style: S.error }, error) : null);
  };
}
