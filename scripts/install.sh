#!/usr/bin/env bash
# Links this repo into the user's GNOME Shell extensions folder and enables it.
# On X11, a brand-new extension is only picked up after a shell restart (Alt+F2, r, Enter).
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
uuid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$repo/metadata.json")"
target="$HOME/.local/share/gnome-shell/extensions/$uuid"

mkdir -p "$(dirname "$target")"
ln -sfn "$repo" "$target"
echo "linked $target -> $repo"

if gnome-extensions enable "$uuid" 2>/dev/null; then
  echo "enabled $uuid"
else
  # Shell has not scanned the new folder yet: mark it enabled so it loads on the next restart
  python3 - "$uuid" <<'PY'
import ast, subprocess, sys
uuid = sys.argv[1]
raw = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions'], text=True)
current = ast.literal_eval(raw.replace('@as ', ''))
if uuid not in current:
    subprocess.check_call(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(current + [uuid])])
PY
  echo "marked $uuid as enabled; restart GNOME Shell to load it (X11: Alt+F2, r, Enter; Wayland: log out and in)"
fi
