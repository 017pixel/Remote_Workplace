#!/usr/bin/env bash
# Installiert (oder aktualisiert) die systemd-**User**-Unit für T3 Code.
# Root wird nicht gebraucht: Die Unit landet in ~/.config/systemd/user/.
# Idempotent — bei unverändertem Inhalt wird nichts geschrieben und nichts neu geladen.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[t3-unit]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

# shellcheck disable=SC2016 # Das ist JavaScript — ${...} darf die Shell nicht ersetzen.
unit_name="$(node -e '
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const dir = process.argv[1];
let config = {};
for (const name of ["workbench.local.json", "workbench.example.json"]) {
  try { config = JSON.parse(readFileSync(join(dir, name), "utf8")); break; } catch { /* nächster Kandidat */ }
}
process.stdout.write(config.t3?.serviceUnit ?? "t3-code.service");
' "$repo_root/config")"

target_dir="$HOME/.config/systemd/user"
target="$target_dir/$unit_name"

# Immer frisch rendern: So folgt die Unit Änderungen an config/workbench.local.json.
node "$repo_root/deploy/systemd/render-units.mjs" >/dev/null
generated="$repo_root/deploy/systemd/generated/t3-code.service"
[[ -f "$generated" ]] || { err "Gerenderte Unit fehlt: $generated"; exit 1; }

if [[ -f "$target" ]] && cmp -s "$generated" "$target"; then
  log "$unit_name ist bereits aktuell."
else
  mkdir -p "$target_dir"
  install -m 0644 "$generated" "$target"
  log "$unit_name geschrieben nach $target"
  systemctl --user daemon-reload
fi

if ! systemctl --user is-enabled "$unit_name" >/dev/null 2>&1; then
  # enable ohne --now: Der Start gehört zum Neustart-Flow (sync-t3-channel.sh),
  # damit der alte Prozess vorher sauber beendet und der Port frei ist.
  if systemctl --user enable "$unit_name" >/dev/null 2>&1; then
    log "$unit_name für den Autostart aktiviert."
  else
    warn "$unit_name konnte nicht aktiviert werden — läuft hier systemd --user?"
  fi
fi
