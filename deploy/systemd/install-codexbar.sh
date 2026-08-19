#!/usr/bin/env bash
# Optional: installiert den lokalen CodexBar-Dienst (Usage-/Limit-API).
# Nur nötig, wenn du die Codex-/Claude-Nutzungshistorie in der Workbench sehen willst.
# Die Unit wird aus deploy/systemd/units/codexbar.service.template gerendert.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
generated_directory="$repo_root/deploy/systemd/generated"
source_unit="$generated_directory/codexbar.service"
target_unit="/etc/systemd/system/codexbar.service"
backup_directory="$repo_root/deploy/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_unit="$backup_directory/codexbar.service.$timestamp.bak"

if ! command -v codexbar >/dev/null 2>&1; then
  echo "codexbar wurde nicht im PATH gefunden. Bitte CodexBar installieren oder cli.codexbar in config/wrapt.local.json setzen." >&2
  exit 1
fi

mkdir -p "$backup_directory"
node "$repo_root/deploy/systemd/render-units.mjs"
systemd-analyze verify "$source_unit"

had_original=false
if sudo test -f "$target_unit"; then
  had_original=true
  sudo cp --preserve=all "$target_unit" "$backup_unit"
fi

rollback() {
  if "$had_original"; then
    sudo cp --preserve=all "$backup_unit" "$target_unit"
    sudo systemctl daemon-reload
    sudo systemctl restart codexbar.service || true
  else
    sudo systemctl disable --now codexbar.service || true
    sudo rm -f "$target_unit"
    sudo systemctl daemon-reload
  fi
}
trap rollback ERR

sudo install -o root -g root -m 0644 "$source_unit" "$target_unit"
sudo systemctl daemon-reload
sudo systemctl enable --now codexbar.service

health_ready=false
for _ in {1..20}; do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:18181/health >/dev/null; then
    health_ready=true
    break
  fi
  sleep 1
done
if [[ "$health_ready" != true ]]; then
  echo "CodexBar wurde nicht innerhalb von 20 Sekunden bereit." >&2
  exit 1
fi
trap - ERR

echo "CodexBar ist aktiv. Logs: journalctl -u codexbar.service"
