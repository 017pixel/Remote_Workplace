#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/bbecker/projects/Remote_Workplace"
backup_directory="$repo_root/deploy/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
pnpm_binary="/home/bbecker/.npm-global/bin/pnpm"
pnpm_path="/home/bbecker/.npm-global/bin:${PATH}"
units=(
  "benjamin-dev-workbench.service"
  "code-server.service"
  "tg-vereinsapp-preview.service"
)
installed_units=()

mkdir -p "$backup_directory"
cd "$repo_root"
if [[ ! -x "$pnpm_binary" ]]; then
  echo "pnpm wurde unter $pnpm_binary nicht gefunden." >&2
  exit 1
fi
if [[ ! -x /home/bbecker/.local/bin/code-server ]]; then
  echo "code-server wurde unter /home/bbecker/.local/bin/code-server nicht gefunden." >&2
  exit 1
fi
if [[ ! -d /home/bbecker/projects/tg-vereinsapp ]]; then
  echo "Das Preview-Projekt /home/bbecker/projects/tg-vereinsapp fehlt." >&2
  exit 1
fi

# Installation und Build laufen als Dienstbenutzer, damit alle Artefakte ihm gehören.
sudo -u bbecker -- env "PATH=$pnpm_path" "$pnpm_binary" install --frozen-lockfile
sudo -u bbecker -- env "PATH=$pnpm_path" "$pnpm_binary" build

for unit in "${units[@]}"; do
  systemd-analyze verify "$repo_root/deploy/systemd/$unit"
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
  sudo systemctl restart benjamin-dev-workbench.service || true
}
trap rollback ERR

for unit in "${units[@]}"; do
  sudo install -o root -g root -m 0644 "$repo_root/deploy/systemd/$unit" "/etc/systemd/system/$unit"
  installed_units+=("$unit")
done

sudo systemctl daemon-reload
sudo systemctl enable --now "${units[@]}"
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3010/api/v1/health >/dev/null
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8080/healthz >/dev/null
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:1234/ >/dev/null
trap - ERR

echo "Workbench, code-server und Preview sind aktiv."
echo "Logs: journalctl -u benjamin-dev-workbench.service -u code-server.service -u tg-vereinsapp-preview.service"
