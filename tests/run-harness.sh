#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="/tmp/DSHPetTest2.app"
SRC="/tmp/pet-asar-src"

pkill -f "$APP/Contents/MacOS" 2>/dev/null || true
pkill -f "/private$APP/Contents/MacOS" 2>/dev/null || true
sleep 0.7

rm -rf "$SRC"
mkdir -p "$SRC"
cp -R "$ROOT/pet" "$SRC/pet"
cp -R "$ROOT/tests/harness" "$SRC/harness"
printf '%s\n' '{"name":"dsh-pet-harness","version":"0.0.1","type":"module","main":"harness/main.cjs"}' > "$SRC/package.json"

rm -f "$APP/Contents/Resources/app.asar"
(cd /tmp && npx --yes @electron/asar pack "$SRC" "$APP/Contents/Resources/app.asar" >/dev/null)

HASH=$(shasum -a 256 "$APP/Contents/Resources/app.asar" | awk '{print $1}')
python3 - "$HASH" "$APP" <<'PY'
import plistlib,sys
p=sys.argv[2]+'/Contents/Info.plist'
with open(p,'rb') as f: d=plistlib.load(f)
d.setdefault('ElectronAsarIntegrity',{}).setdefault('Resources/app.asar',{})['hash']=sys.argv[1]
with open(p,'wb') as f: plistlib.dump(d,f)
PY
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
rm -rf /tmp/dsh-pet-harness-userdata /tmp/dsh-pet-harness-error.txt
nohup env -u ELECTRON_RUN_AS_NODE "$APP/Contents/MacOS/DeepSeek Harness" --user-data-dir=/tmp/dsh-pet-harness-userdata --remote-debugging-port=9224 >/tmp/dsh-pet-harness.log 2>&1 &
for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:18765/state >/dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -s http://127.0.0.1:18765/state | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ['main','pet','petWindow','mode','config']}, ensure_ascii=False, indent=2))"
