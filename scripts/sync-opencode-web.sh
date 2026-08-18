#!/usr/bin/env bash
# Stellt sicher, dass die offizielle OpenCode-Web-UI hinter /opencode läuft.
# OpenCode und OpenCode CLI teilen sich bewusst dasselbe Home und damit Verlauf/Accounts.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[opencode-web]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }
fail() { err "$*"; exit 1; }

read_config() {
  # shellcheck disable=SC2016 # Das ist JavaScript — ${...} darf die Shell nicht ersetzen.
  node -e '
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const dir = process.argv[1];
let config = {};
for (const name of ["workbench.local.json", "workbench.example.json"]) {
  try { config = JSON.parse(readFileSync(join(dir, name), "utf8")); break; } catch { /* nächster Kandidat */ }
}
const home = config.system?.homeDirectory ?? process.env.HOME ?? "";
const web = config.opencodeWeb ?? {};
const values = [
  web.cliPath ?? config.cli?.opencode ?? `${home}/.npm-global/bin/opencode`,
  web.host ?? "127.0.0.1",
  String(web.port ?? 3774),
  web.serviceUnit ?? "opencode-web.service",
  String(web.stopTimeoutSeconds ?? 20),
  String(web.portTimeoutSeconds ?? 30),
  String(web.healthTimeoutSeconds ?? 60),
];
process.stdout.write(values.join("\n") + "\n");
' "$repo_root/config"
}

config_lines="$(read_config)" || fail "config/workbench.local.json konnte nicht gelesen werden."
{
  read -r cli_path
  read -r web_host
  read -r web_port
  read -r service_unit
  read -r stop_timeout
  read -r port_timeout
  read -r health_timeout
} <<< "$config_lines"

[[ -x "$cli_path" ]] || fail "OpenCode-Binary fehlt oder ist nicht ausführbar: $cli_path"
health_url="http://${web_host}:${web_port}/"

reachable() {
  local code
  code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$health_url" || true)"
  [[ -n "$code" && "$code" != "000" ]]
}

port_pids() {
  ss -ltnpH "sport = :${web_port}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}

terminate_pids() {
  local pids=("$@")
  [[ ${#pids[@]} -gt 0 ]] || return 0
  log "Beende OpenCode-Web-Prozess: PID ${pids[*]}"
  kill -TERM "${pids[@]}" 2>/dev/null || true
  local waited=0
  while [[ "$waited" -lt "$stop_timeout" ]]; do
    local alive=()
    local pid
    for pid in "${pids[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive+=("$pid")
    done
    [[ ${#alive[@]} -eq 0 ]] && return 0
    sleep 1
    waited=$((waited + 1))
  done
  warn "OpenCode Web reagiert nicht auf SIGTERM — SIGKILL nach ${stop_timeout}s."
  kill -KILL "${pids[@]}" 2>/dev/null || true
}

wait_port_free() {
  local waited=0
  while [[ "$waited" -lt "$port_timeout" ]]; do
    [[ -z "$(port_pids)" ]] && return 0
    sleep 1
    waited=$((waited + 1))
  done
  fail "Port ${web_port} ist nach ${port_timeout}s weiterhin belegt."
}

start_web() {
  if systemctl --user is-enabled "$service_unit" >/dev/null 2>&1; then
    log "Starte $service_unit …"
    systemctl --user restart "$service_unit" || fail "$service_unit konnte nicht gestartet werden. Details: journalctl --user -u $service_unit"
    return 0
  fi
  local fallback_log="$repo_root/data/restart-logs/opencode-web.log"
  mkdir -p "$(dirname "$fallback_log")"
  warn "$service_unit ist nicht aktiviert — starte OpenCode Web direkt (Log: $fallback_log)."
  BROWSER=true setsid nohup "$cli_path" web --hostname "$web_host" --port "$web_port" \
    >>"$fallback_log" 2>&1 </dev/null &
  disown || true
}

wait_health() {
  local waited=0
  while [[ "$waited" -lt "$health_timeout" ]]; do
    if reachable; then
      log "OpenCode Web antwortet auf ${health_url}"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  fail "OpenCode Web antwortet nach ${health_timeout}s nicht auf ${health_url}."
}

# Die Unit wird auch im Development-Modus installiert; ihr Start bleibt aber dem
# Neustart-Flow überlassen. Ein bereits erreichbarer Dienst bleibt unangetastet.
bash "$repo_root/scripts/install-opencode-web-unit.sh"
if reachable; then
  log "OpenCode Web läuft bereits — nichts zu tun."
  exit 0
fi

if systemctl --user is-active "$service_unit" >/dev/null 2>&1; then
  systemctl --user stop "$service_unit" >/dev/null 2>&1 || warn "systemctl stop meldete einen Fehler."
fi
mapfile -t remaining < <(port_pids)
terminate_pids "${remaining[@]}"
wait_port_free
start_web
wait_health
