#!/usr/bin/env bash
# Installiert die Remote-Workplace-Systemdienste (system-weit).
# Die Units werden aus den Templates in deploy/systemd/units/ gerendert und mit
# den Werten aus config/workbench.local.json gefüllt. code-server ist optional.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_directory="$repo_root/deploy/backups"
generated_directory="$repo_root/deploy/systemd/generated"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
pnpm_binary="$(command -v pnpm || true)"
service_user="${SUDO_USER:-$(id -un)}"

# Pflicht-Unit + optionale Units (nur installiert, wenn die Binaries existieren).
units=("remote-workplace.service")
installed_units=()

mkdir -p "$backup_directory"
cd "$repo_root"

if [[ -z "$pnpm_binary" ]]; then
  echo "pnpm wurde nicht im PATH gefunden. Bitte zuerst scripts/install-deps.sh ausführen." >&2
  exit 1
fi

# code-server nur einbinden, wenn es vorhanden ist.
if command -v code-server >/dev/null 2>&1; then
  units+=("code-server.service")
fi

# Templates rendern.
node "$repo_root/deploy/systemd/render-units.mjs"

# Installation und Build laufen als Dienstbenutzer, damit alle Artefakte ihm gehören.
sudo -u "$service_user" -- env "PATH=$(dirname "$pnpm_binary"):$PATH" "$pnpm_binary" install --frozen-lockfile
sudo -u "$service_user" -- env "PATH=$(dirname "$pnpm_binary"):$PATH" "$pnpm_binary" build

for unit in "${units[@]}"; do
  systemd-analyze verify "$generated_directory/$unit"
  target="/etc/systemd/system/$unit"
  if sudo test -f "$target"; then
    sudo cp --preserve=all "$target" "$backup_directory/$unit.$timestamp.bak"
  fi
done

rollback() {
  for unit in "${installed_units[@]}"; do
    backup="$backup_directory/$unit.$timestamp.bak"
    target="/etc/systemd/system/$unit"
    if sudo test -f "$backup"; then
      sudo cp --preserve=all "$backup" "$target"
    else
      sudo systemctl disable --now "$unit" || true
      sudo rm -f "$target"
    fi
  done
  sudo systemctl daemon-reload
  sudo systemctl restart remote-workplace.service || true
}
trap rollback ERR

for unit in "${units[@]}"; do
  sudo install -o root -g root -m 0644 "$generated_directory/$unit" "/etc/systemd/system/$unit"
  installed_units+=("$unit")
done

sudo systemctl daemon-reload
sudo systemctl enable --now "${units[@]}"

# T3 Code läuft als User-Unit (kein root nötig) und wird deshalb separat eingebunden.
# Gestartet wird sie erst über den Neustart-Flow (scripts/sync-t3-channel.sh).
if [[ -x "$repo_root/scripts/install-t3-unit.sh" ]]; then
  sudo -u "$service_user" -- env "XDG_RUNTIME_DIR=/run/user/$(id -u "$service_user")" \
    bash "$repo_root/scripts/install-t3-unit.sh" || echo "Hinweis: T3-Code-Unit konnte nicht installiert werden." >&2
fi
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3010/api/v1/health >/dev/null
trap - ERR

echo "Remote Workplace ist aktiv."
echo "Logs: journalctl -u ${units[*]}"
