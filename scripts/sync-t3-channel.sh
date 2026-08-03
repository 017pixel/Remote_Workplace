#!/usr/bin/env bash
# Bringt die laufende T3-Code-Instanz auf den in der Config eingestellten Kanal
# (config/workbench.local.json → "t3.channel"). Wird vom Neustart-Flow aufgerufen
# (scripts/restart-backend.sh und restart-all.sh) und kann zum Debuggen auch direkt
# gestartet werden.
#
# Ablauf: Kanal vergleichen → npm-Paket tauschen → alten Prozess beenden → Port abwarten
# → User-Unit starten → per HTTP auf Bereitschaft warten.
#
# Wichtige Eigenschaften:
# - Stimmt der Kanal und antwortet die Instanz, passiert nichts (kein unnötiger Abbruch
#   laufender T3-Sitzungen bei jedem Backend-Neustart).
# - Der npm-Install läuft VOR dem Stoppen. Schlägt er fehl, läuft der alte Kanal weiter.
# - Beide Kanäle nutzen dasselbe Datenverzeichnis (~/.t3/userdata) — Threads bleiben erhalten.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[t3-kanal]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

# Steht kein Kanalwechsel an, ist dieser Lauf reine Selbstheilung eines nicht
# erreichbaren T3. Dann darf ein Fehler den Backend-Neustart nicht blockieren.
channel_change_pending=0
fail() {
  if [[ "$channel_change_pending" -eq 1 ]]; then
    err "$*"
    exit 1
  fi
  warn "$* (kein Kanalwechsel angefordert — der Neustart läuft weiter)"
  exit 0
}

# --- Konfiguration lesen ------------------------------------------------------
# Eine Zeile je Wert, feste Reihenfolge. Defaults stehen im Zod-Schema
# (apps/server/src/config/workbench-config.ts) und hier bewusst identisch.
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
const t3 = config.t3 ?? {};
const values = [
  t3.channel ?? "stable",
  t3.npmPackage ?? "t3",
  t3.cliPath ?? `${home}/.npm-global/bin/t3`,
  t3.host ?? "127.0.0.1",
  String(t3.port ?? 3773),
  t3.serviceUnit ?? "t3-code.service",
  t3.legacyLauncher ?? "",
  String(t3.installTimeoutSeconds ?? 300),
  String(t3.stopTimeoutSeconds ?? 20),
  String(t3.portTimeoutSeconds ?? 30),
  String(t3.healthTimeoutSeconds ?? 60),
  config.paths?.projectsRoot ?? `${home}/projects`,
];
process.stdout.write(values.join("\n") + "\n");
' "$repo_root/config"
}

if ! config_lines="$(read_config)"; then
  err "config/workbench.local.json konnte nicht gelesen werden."
  exit 1
fi

{
  read -r configured_channel
  read -r npm_package
  read -r cli_path
  read -r t3_host
  read -r t3_port
  read -r service_unit
  read -r legacy_launcher
  read -r install_timeout
  read -r stop_timeout
  read -r port_timeout
  read -r health_timeout
  read -r projects_root
} <<< "$config_lines"

case "$configured_channel" in
  stable) npm_tag="latest" ;;
  nightly) npm_tag="nightly" ;;
  *) err "Unbekannter Kanal in der Config: '$configured_channel' (erlaubt: stable, nightly)"; exit 1 ;;
esac

health_url="http://${t3_host}:${t3_port}/"

# --- Hilfsfunktionen ----------------------------------------------------------
# Leere Ausgabe bedeutet "nicht installiert" oder "nicht lauffähig" — beides ist ein
# gültiger Zustand, deshalb darf die Funktion nie mit einem Fehler abbrechen.
installed_version() {
  [[ -x "$cli_path" ]] || return 0
  timeout 10 "$cli_path" --version 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[A-Za-z0-9.-]*' \
    | head -n 1 || true
}

channel_of_version() {
  [[ -n "$1" ]] || return 0
  case "$1" in
    *-nightly*) printf 'nightly' ;;
    *) printf 'stable' ;;
  esac
}

# Jede HTTP-Antwort zählt als "läuft" — auch 401/404. Nur "keine Verbindung" ist ein Fehler.
t3_reachable() {
  local code
  code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$health_url" || true)"
  [[ -n "$code" && "$code" != "000" ]]
}

port_pids() {
  ss -ltnpH "sport = :${t3_port}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}

resolve_npm() {
  local candidate node_bin
  if candidate="$(command -v npm 2>/dev/null)" && [[ -x "$candidate" ]]; then
    printf '%s' "$candidate"; return 0
  fi
  if node_bin="$(command -v node 2>/dev/null)"; then
    candidate="$(dirname "$node_bin")/npm"
    [[ -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  fi
  for candidate in "$HOME/.npm-global/bin/npm" "/usr/local/bin/npm" "/usr/bin/npm"; do
    [[ -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

# SIGTERM, nach stop_timeout SIGKILL. Gilt für den Altstarter wie für Port-Belegungen.
terminate_pids() {
  local reason="$1"; shift
  local pids=("$@")
  [[ ${#pids[@]} -gt 0 ]] || return 0
  log "Beende ${reason}: PID ${pids[*]}"
  kill -TERM "${pids[@]}" 2>/dev/null || true
  local waited=0
  while [[ "$waited" -lt "$stop_timeout" ]]; do
    local alive=()
    local pid
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then alive+=("$pid"); fi
    done
    [[ ${#alive[@]} -eq 0 ]] && return 0
    sleep 1
    waited=$((waited + 1))
  done
  warn "${reason} reagiert nicht auf SIGTERM — SIGKILL nach ${stop_timeout}s."
  kill -KILL "${pids[@]}" 2>/dev/null || true
  sleep 1
}

stop_t3() {
  if systemctl --user is-active "$service_unit" >/dev/null 2>&1; then
    log "Stoppe $service_unit …"
    systemctl --user stop "$service_unit" >/dev/null 2>&1 || warn "systemctl stop meldete einen Fehler."
  fi

  # Der frühere, von Hand gestartete Launcher hält sonst weiter den Port.
  if [[ -n "$legacy_launcher" ]]; then
    local legacy_pids
    mapfile -t legacy_pids < <(pgrep -f -- "$legacy_launcher" 2>/dev/null || true)
    if [[ ${#legacy_pids[@]} -gt 0 ]]; then
      terminate_pids "Alt-Starter $legacy_launcher" "${legacy_pids[@]}"
    fi
  fi

  local remaining
  mapfile -t remaining < <(port_pids)
  if [[ ${#remaining[@]} -gt 0 ]]; then
    terminate_pids "Prozess auf Port ${t3_port}" "${remaining[@]}"
  fi
  return 0
}

wait_port_free() {
  local waited=0
  while [[ "$waited" -lt "$port_timeout" ]]; do
    [[ -z "$(port_pids)" ]] && return 0
    sleep 1
    waited=$((waited + 1))
  done
  fail "Port ${t3_port} ist nach ${port_timeout}s immer noch belegt (PID $(port_pids | tr '\n' ' ')). T3 wurde nicht neu gestartet."
}

start_t3() {
  if systemctl --user is-enabled "$service_unit" >/dev/null 2>&1; then
    log "Starte $service_unit …"
    systemctl --user restart "$service_unit" || fail "$service_unit konnte nicht gestartet werden. Details: journalctl --user -u $service_unit"
    return 0
  fi
  # Dev-Modus bzw. kein systemd --user: losgelöst starten, damit T3 den Aufrufer überlebt.
  local fallback_log="$repo_root/data/restart-logs/t3-code.log"
  mkdir -p "$(dirname "$fallback_log")"
  warn "$service_unit ist nicht aktiviert — starte T3 Code direkt (Log: $fallback_log)."
  setsid nohup "$cli_path" serve --host "$t3_host" --port "$t3_port" "$projects_root" \
    >>"$fallback_log" 2>&1 </dev/null &
  disown || true
}

wait_health() {
  local waited=0
  while [[ "$waited" -lt "$health_timeout" ]]; do
    if t3_reachable; then
      log "T3 Code antwortet auf ${health_url}"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  fail "T3 Code antwortet nach ${health_timeout}s nicht auf ${health_url}."
}

# --- Ablauf -------------------------------------------------------------------
current_version="$(installed_version)"
current_channel="$(channel_of_version "$current_version")"

log "Eingestellt: ${configured_channel} — aktiv: ${current_channel:-nicht installiert}${current_version:+ (v${current_version})}"

if [[ "$current_channel" == "$configured_channel" ]]; then
  if t3_reachable; then
    log "Kanal stimmt und die Instanz antwortet — nichts zu tun."
    exit 0
  fi
  warn "Kanal stimmt, aber ${health_url} antwortet nicht — T3 Code wird neu gestartet."
else
  channel_change_pending=1
  if [[ "$current_channel" == "nightly" && "$configured_channel" == "stable" ]]; then
    warn "Downgrade Nightly → Stable: Beide Kanäle teilen sich ~/.t3/userdata/state.sqlite."
    warn "Hat Nightly das Schema angehoben, kann die Stable-Version damit Probleme bekommen."
    # Automatisches Backup vor dem Schema-Downgrade (F01-06).
    backup_dir="$HOME/.t3/backups"
    state_db="$HOME/.t3/userdata/state.sqlite"
    if [[ -f "$state_db" ]]; then
      mkdir -p "$backup_dir"
      backup_file="$backup_dir/state-$(date +%Y%m%dT%H%M%S).sqlite"
      if cp "$state_db" "$backup_file"; then
        log "state.sqlite vor dem Downgrade gesichert nach $backup_file"
      else
        warn "Sicherung von $state_db nach $backup_file fehlgeschlagen — Downgrade wird trotzdem fortgesetzt."
      fi
    else
      warn "Keine state.sqlite unter ~/.t3/userdata gefunden — nichts zu sichern."
    fi
  fi

  npm_bin="$(resolve_npm)" || fail "npm wurde nicht gefunden — der Kanal kann nicht gewechselt werden."
  log "Installiere ${npm_package}@${npm_tag} über ${npm_bin} …"
  if ! timeout "$install_timeout" "$npm_bin" install -g "${npm_package}@${npm_tag}"; then
    fail "npm install ${npm_package}@${npm_tag} ist fehlgeschlagen (Registry nicht erreichbar?). Der bisherige Kanal (${current_channel:-nicht installiert}) läuft unverändert weiter."
  fi

  new_version="$(installed_version)"
  new_channel="$(channel_of_version "$new_version")"
  if [[ "$new_channel" != "$configured_channel" ]]; then
    fail "Nach der Installation meldet ${cli_path} Version '${new_version:-unbekannt}' (Kanal ${new_channel:-unbekannt}) statt ${configured_channel}."
  fi
  log "Installiert: v${new_version} (${new_channel})"
fi

stop_t3
wait_port_free
bash "$repo_root/scripts/install-t3-unit.sh"
start_t3
wait_health

final_version="$(installed_version)"
log "T3 Code läuft im Kanal ${configured_channel} (v${final_version:-unbekannt}) auf Port ${t3_port}."
