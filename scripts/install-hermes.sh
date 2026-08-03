#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="${CONFIG_DIR:-$repo_root/config}"
config_file="$config_dir/workbench.local.json"
user_unit_directory="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
generated_directory="$repo_root/deploy/systemd/generated"
backup_directory="${HERMES_INSTALL_BACKUP_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/remote-workplace/hermes-install}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
keep_allowlist=false
if [[ "${1:-}" == "--keep-allowlist" ]]; then keep_allowlist=true; fi
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

local_config_file="$config_dir/workbench.local.json"
if [[ ! -f "$config_file" ]]; then config_file="$config_dir/workbench.example.json"; fi
cli="${HERMES_CLI_PATH:-$(command -v hermes || true)}"
if [[ -z "$cli" || ! -x "$cli" ]]; then echo "Hermes-CLI nicht gefunden. Dieses Skript installiert Hermes nicht neu." >&2; exit 1; fi
version_output="$($cli version 2>&1)"
checkout="$(printf '%s\n' "$version_output" | sed -n -E 's/^(Project|Install directory):[[:space:]]*//p' | head -1)"
if [[ -z "$checkout" || ! -d "$checkout" ]]; then echo "Der Hermes-Checkout konnte aus hermes version nicht erkannt werden." >&2; exit 1; fi
if [[ -n "${HERMES_HOME:-}" ]]; then
  home_directory="$HERMES_HOME"
elif [[ -f "$local_config_file" ]]; then
  home_directory="$(node -e 'const fs=require("node:fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(c.hermes?.homeDirectory || `${c.system.homeDirectory}/.hermes`);' "$local_config_file")"
else
  home_directory="$HOME/.hermes"
fi
python_path="${checkout}/venv/bin/python"
[[ -x "$python_path" ]] || { echo "Hermes-Python-Umgebung fehlt: $python_path" >&2; exit 1; }

npm_cmd=(npm)
npm_major="$(npm --version | cut -d. -f1)"
if [[ "$npm_major" -lt 12 ]]; then npm_cmd=(npx --yes npm@12); fi
web_install_command=(install)
if [[ -f "$checkout/web/package-lock.json" || -f "$checkout/web/npm-shrinkwrap.json" ]]; then
  web_install_command=(ci)
fi

backup_output="$($cli backup 2>&1)"
backup_path="$(printf '%s\n' "$backup_output" | grep -Eo '/[^[:space:]]+\.zip' | tail -1 || true)"
echo "Hermes erkannt: $(printf '%s\n' "$version_output" | head -1)"
[[ -n "$backup_path" ]] && echo "Backup erstellt: $backup_path"

build_log="$(mktemp)"
cleanup_build() { rm -f "$build_log"; }
trap cleanup_build EXIT
if ! (cd "$checkout/web" && "${npm_cmd[@]}" "${web_install_command[@]}" --no-audit --no-fund && "${npm_cmd[@]}" run build) >"$build_log" 2>&1; then
  sed -E 's/(api[_-]?key|token|secret|password|authorization)([[:space:]]*[:=][[:space:]]*)[^[:space:],;]+/\1\2[redigiert]/Ig' "$build_log" | tail -40 >&2
  exit 1
fi
[[ -f "$checkout/hermes_cli/web_dist/index.html" ]] || { echo "Der Hermes-Dashboard-Build hat web_dist/index.html nicht erzeugt." >&2; exit 1; }
trap - EXIT
rm -f "$build_log"

node "$repo_root/scripts/update-hermes-config.mjs" "$config_dir" "$cli" "$home_directory" "$checkout" "$python_path"
mkdir -p "$home_directory/dashboard-themes" "$user_unit_directory" "$backup_directory"
install -m 0644 "$repo_root/deploy/hermes/dashboard-themes/remote-workplace.yaml" "$home_directory/dashboard-themes/remote-workplace.yaml"

if [[ "$keep_allowlist" == true ]]; then
  "$python_path" "$repo_root/scripts/hermes-config.py" harden "$home_directory/config.yaml" --keep-allowlist
else
  "$python_path" "$repo_root/scripts/hermes-config.py" harden "$home_directory/config.yaml"
fi
"$python_path" "$repo_root/scripts/hermes-config.py" theme "$home_directory/config.yaml" remote-workplace

node "$repo_root/deploy/systemd/render-units.mjs"
units=(hermes-dashboard.service hermes-update.service hermes-update.timer hermes-update-retry.timer)
installed=()
rollback() {
  for unit in "${installed[@]}"; do
    systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
    backup="$backup_directory/$unit.$timestamp.bak"
    if [[ -f "$backup" ]]; then install -m 0644 "$backup" "$user_unit_directory/$unit"; else rm -f "$user_unit_directory/$unit"; fi
  done
  systemctl --user daemon-reload >/dev/null 2>&1 || true
}
trap rollback ERR
for unit in "${units[@]}"; do
  systemd-analyze verify "$generated_directory/$unit"
  if [[ -f "$user_unit_directory/$unit" ]]; then cp --preserve=all "$user_unit_directory/$unit" "$backup_directory/$unit.$timestamp.bak"; fi
done
for unit in "${units[@]}"; do
  install -m 0644 "$generated_directory/$unit" "$user_unit_directory/$unit"
  installed+=("$unit")
done
systemctl --user daemon-reload
systemctl --user enable --now hermes-dashboard.service hermes-update.timer hermes-update-retry.timer
systemctl --user enable hermes-gateway.service >/dev/null 2>&1 || true

dashboard_token=""
for _ in {1..60}; do
  html="$(curl -fsS --max-time 2 -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/ 2>/dev/null || true)"
  dashboard_token="$(printf '%s' "$html" | sed -n 's/.*__HERMES_SESSION_TOKEN__="\([A-Za-z0-9_-]\{16,\}\)".*/\1/p' | head -1)"
  [[ -n "$dashboard_token" ]] && break
  sleep 1
done
if [[ -n "$dashboard_token" ]]; then
  curl -fsS --max-time 10 -X PUT -H 'Host: 127.0.0.1:9119' -H "X-Hermes-Session-Token: $dashboard_token" -H 'Content-Type: application/json' --data '{"name":"remote-workplace"}' http://127.0.0.1:9119/api/dashboard/theme >/dev/null || true
fi
trap - ERR
echo "Hermes-Dashboard und Update-Timer sind als User-Units installiert."
echo "Gateway-Unit unverändert übernommen: hermes-gateway.service"
