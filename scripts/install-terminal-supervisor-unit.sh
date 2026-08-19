#!/usr/bin/env bash
# Installiert (oder aktualisiert) die systemd-**User**-Unit für den dedizierten
# tmux-Terminal-Supervisor. Root wird nicht gebraucht: Die Unit landet in
# ~/.config/systemd/user/. Idempotent — bei unverändertem Inhalt wird nichts
# geschrieben und nichts neu geladen.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[terminal-supervisor]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

unit_name="wrapt-terminal-supervisor.service"
target_dir="$HOME/.config/systemd/user"
target="$target_dir/$unit_name"

# Immer frisch rendern: So folgt die Unit Änderungen an config/wrapt.local.json.
node "$repo_root/deploy/systemd/render-units.mjs" >/dev/null
generated="$repo_root/deploy/systemd/generated/$unit_name"
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
  if systemctl --user enable "$unit_name" >/dev/null 2>&1; then
    log "$unit_name für den Autostart aktiviert."
  else
    warn "$unit_name konnte nicht aktiviert werden — läuft hier systemd --user?"
  fi
fi
