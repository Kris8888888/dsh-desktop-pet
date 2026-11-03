#!/bin/bash
# 把桌面宠物装进 DSH（Mac）。DSH 升级后重跑一次即可。Windows 用 tools/install-windows.ps1。
# 打补丁用 tools/patch.mjs，直接借 DSH 自己当 Node 跑，不需要另装 Python / Node。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
PROFILE="${DSH_PROFILE:-${DSH_HOME:-$HOME/.dsh}/profiles/desktop}"
ASAR="$APP/Contents/Resources/app.asar"
PLIST="$APP/Contents/Info.plist"
BACKUP="$ROOT/backup"
node_() { ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DeepSeek Harness" "$ROOT/tools/patch.mjs" "$@"; }

[ -f "$ASAR" ] || { echo "找不到 $ASAR"; exit 1; }
[ -d "$PROFILE" ] || { echo "找不到 profile $PROFILE"; exit 1; }
mkdir -p "$BACKUP"

# 当前装的是官方原包（里面没有 pet/）→ 记为官方备份；DSH 升级过就会刷新这份备份
if [ "$(node_ has-pet "$ASAR")" = "no" ]; then
  cp "$ASAR" "$BACKUP/app.asar.orig"
  cp "$PLIST" "$BACKUP/Info.plist.orig"
  echo "已备份官方 asar/Info.plist"
fi

echo "打补丁 …"
NEW="$(mktemp /tmp/dsh-pet.XXXXXX)"
trap 'rm -f "$NEW"' EXIT
HASH="$(node_ patch "$BACKUP/app.asar.orig" "$NEW" "$ROOT/pet" | tail -1)"
cp "$NEW" "$ASAR"
cp "$BACKUP/Info.plist.orig" "$PLIST"
# Electron 校验的是包头的 SHA256（DSH 目前没开这项校验，照样写对）
/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash $HASH" "$PLIST"

echo "重新签名（ad-hoc）…"
# 先整体 ad-hoc 签一遍（helper / framework 都要有新签名），再单独给外层写死
# designated requirement。不写的话 ad-hoc 签名的 DR 会被钉成当前二进制的
# cdhash，Squirrel 升级时拿它校验新版本必然失败：
#   Code signature ... did not pass validation: code failed to satisfy specified code requirement(s)
# 钉成 identifier 之后，官方新版（同样是 com.deepseek.dsh）就能通过校验，
# DSH 升级不会被宠物挡掉；升级后重跑一次本脚本把宠物装回去即可。
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
codesign --force --sign - -r='designated => identifier "com.deepseek.dsh"' "$APP" >/dev/null 2>&1
codesign --verify --deep --strict "$APP"

echo "安装客户端插件 …"
node_ profile "$PROFILE" "$ROOT" >/dev/null

echo "完成。请完全退出 DSH（⌘Q）再打开。"
