#!/usr/bin/env bash
# Gemeinsame Helfer für die Neustart-Skripte (restart-frontend/-backend/-all.sh).
# Wird per `source` eingebunden, nicht direkt ausgeführt.

SERVICE_UNIT="wrapt.service"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root" || { echo "[fehler] Projektverzeichnis nicht erreichbar: $repo_root" >&2; exit 1; }

# systemctl --user braucht den Runtime-Dir. Unter dem laufenden Dienst ist er gesetzt,
# beim manuellen Aufruf aus einem fremden Kontext nicht immer.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[restart]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

status_dir="$repo_root/data/restart-logs"
status_file="$status_dir/last-status.json"
lock_dir="${RESTART_LOCK_DIRECTORY:-$status_dir/restart.lock}"
restart_target="${RESTART_TARGET:-unbekannt}"
restart_started_at="$(date -Is)"
restart_last_step="Start"
restart_job_id="${RESTART_JOB_ID:-}"
restart_handed_off=0

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Schreibt den Zustand des Laufs als JSON. Das Backend liest die Datei für
# GET /api/v1/system/restart/status — so zeigt das UI den echten Fehler
# statt nur in einen Timeout zu laufen.
write_status() {
  local phase="$1" exit_code="$2" message="$3"
  local temporary
  mkdir -p "$status_dir" 2>/dev/null || return 0
  temporary="$status_file.$$.$RANDOM.tmp"
  cat > "$temporary" <<JSON
{
  "jobId": "$(json_escape "$restart_job_id")",
  "target": "$(json_escape "$restart_target")",
  "phase": "$(json_escape "$phase")",
  "exitCode": ${exit_code},
  "step": "$(json_escape "$restart_last_step")",
  "message": "$(json_escape "$message")",
  "startedAt": "$(json_escape "$restart_started_at")",
  "updatedAt": "$(date -Is)",
  "logFile": "$(json_escape "${RESTART_LOG_FILE:-}")"
}
JSON
  chmod 600 "$temporary" 2>/dev/null || true
  mv -f "$temporary" "$status_file"
}

step() {
  restart_last_step="$*"
  log "$*"
  write_status "running" "null" "Läuft …"
}

release_restart_lock() {
  rm -f "$lock_dir/owner" 2>/dev/null || true
  rmdir "$lock_dir" 2>/dev/null || true
}

on_exit() {
  local code="$?"
  if [[ "$restart_handed_off" -eq 1 && "$code" -eq 0 ]]; then
    trap - EXIT
    return 0
  fi
  if [[ "$code" -eq 0 ]]; then
    write_status "succeeded" 0 "Neustart abgeschlossen."
  else
    write_status "failed" "$code" "Abbruch bei: ${restart_last_step} (Exit-Code ${code}). Details stehen im Log."
    err "Abbruch bei: ${restart_last_step} (Exit-Code ${code})"
  fi
  release_restart_lock
}

# Muss von jedem Skript direkt nach dem `source` aufgerufen werden.
restart_begin() {
  restart_target="$1"
  mkdir -p "$status_dir"
  if [[ "${RESTART_LOCK_HELD:-0}" != "1" ]]; then
    if ! mkdir "$lock_dir" 2>/dev/null; then
      err "Es läuft bereits ein Neustart."
      exit 75
    fi
  fi
  if [[ -z "$restart_job_id" ]]; then
    restart_job_id="$(node -e 'console.log(crypto.randomUUID())')"
  fi
  printf '%s\n' "$restart_job_id" > "$lock_dir/owner"
  chmod 600 "$lock_dir/owner" 2>/dev/null || true
  trap on_exit EXIT
  write_status "running" 0 "Läuft …"
  if [[ -z "${RESTART_BASELINE_BOOT_ID:-}" ]]; then
    RESTART_BASELINE_BOOT_ID="$(health_value bootId || true)"
    export RESTART_BASELINE_BOOT_ID
  fi
  if [[ -z "${RESTART_BASELINE_WEB_BUILD_ID:-}" ]]; then
    RESTART_BASELINE_WEB_BUILD_ID="$(health_value webBuildId || true)"
    export RESTART_BASELINE_WEB_BUILD_ID
  fi
  log "Ziel: $restart_target — Projekt: $repo_root"
  find "$status_dir" -maxdepth 1 -type f -name 'restart-*.log' -mtime +30 -delete 2>/dev/null || true
}

# pnpm zuverlässig finden. Der Serverprozess startet diese Skripte mit dem PATH der
# systemd-Unit; dort fehlt das globale npm-bin-Verzeichnis, weil die Unit pnpm über einen
# absoluten Pfad startet. Nur auf $PATH zu vertrauen ließ jeden Neustart aus dem UI mit
# "pnpm nicht gefunden" scheitern. Deshalb: PATH, dann bekannte Orte, dann corepack.
resolve_pnpm() {
  local candidate node_bin
  if candidate="$(command -v pnpm 2>/dev/null)" && [[ -x "$candidate" ]]; then
    printf '%s' "$candidate"; return 0
  fi

  local -a candidates=(
    "${PNPM_HOME:-}/pnpm"
    "$HOME/.npm-global/bin/pnpm"
    "$HOME/.local/share/pnpm/pnpm"
    "$HOME/.local/bin/pnpm"
    "/usr/local/bin/pnpm"
    "/usr/bin/pnpm"
  )
  # Neben der laufenden node-Binary liegt bei nvm/volta üblicherweise auch pnpm.
  if node_bin="$(command -v node 2>/dev/null)"; then
    candidates+=("$(dirname "$node_bin")/pnpm")
  fi

  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" && -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done

  # Letzter Ausweg: corepack bringt pnpm selbst mit.
  if command -v corepack >/dev/null 2>&1; then
    printf 'corepack pnpm'; return 0
  fi
  return 1
}

if ! pnpm_cmd="$(resolve_pnpm)"; then
  err "pnpm wurde nicht gefunden — weder im PATH noch an den üblichen Orten."
  err "PATH war: ${PATH}"
  err "Abhilfe: scripts/install-deps.sh ausführen oder PNPM_HOME setzen."
  exit 1
fi

# Für verschachtelte Aufrufe (pnpm-Skripte rufen wieder pnpm auf) das Verzeichnis in den PATH.
if [[ "$pnpm_cmd" != "corepack pnpm" ]]; then
  PATH="$(dirname "$pnpm_cmd"):$PATH"
  export PATH
fi

# shellcheck disable=SC2086 # pnpm_cmd kann "corepack pnpm" sein und muss gesplittet werden.
run_pnpm() { $pnpm_cmd "$@"; }

log "pnpm: $pnpm_cmd — node: $(command -v node || echo 'nicht gefunden') $(node --version 2>/dev/null)"

# Baut die Verträge (contracts). Web und Server hängen davon ab, deshalb immer zuerst.
build_contracts() {
  step "Baue @wrapt/contracts …"
  run_pnpm --filter @wrapt/contracts build
}

build_frontend() {
  step "Baue Frontend (@wrapt/web) …"
  run_pnpm --filter @wrapt/web build
}

build_backend() {
  step "Baue Backend (@wrapt/server) …"
  run_pnpm --filter @wrapt/server build
}

# Wendet einen in den Einstellungen gewählten T3-Kanal an (stable ⇄ nightly).
# Muss VOR schedule_service_restart laufen: Danach wird dieser Prozess mit dem Dienst
# beendet. Stimmt der Kanal bereits und antwortet T3, ist der Aufruf ein No-op.
sync_t3_channel() {
  step "Prüfe T3-Code-Kanal …"
  if [[ ! -r "$repo_root/scripts/sync-t3-channel.sh" ]]; then
    warn "scripts/sync-t3-channel.sh fehlt — T3-Kanal wird nicht geprüft."
    return 0
  fi
  bash "$repo_root/scripts/sync-t3-channel.sh"
}

sync_opencode_web() {
  step "Prüfe OpenCode Web …"
  if [[ ! -r "$repo_root/scripts/sync-opencode-web.sh" ]]; then
    warn "scripts/sync-opencode-web.sh fehlt — OpenCode Web wird nicht geprüft."
    return 0
  fi
  bash "$repo_root/scripts/sync-opencode-web.sh"
}

# Plant den Dienst-Neustart in einer eigenen, transienten systemd-Einheit ein.
# Nötig, weil der Aufrufer (Server-Prozess oder ein Workbench-Terminal) selbst in der
# Cgroup von wrapt.service liegen kann — ein direkter Neustart würde ihn mitten im
# Ablauf killen. Die transiente Einheit läuft außerhalb dieser Cgroup und überlebt.
schedule_service_restart() {
  step "Plane Neustart von $SERVICE_UNIT ein …"
  if ! command -v systemctl >/dev/null 2>&1; then
    err "systemctl ist nicht verfügbar; der Backend-Neustart kann nicht verifiziert werden."
    return 1
  fi
  if ! systemctl --user is-enabled "$SERVICE_UNIT" >/dev/null 2>&1; then
    step "Warte auf den automatischen Development-Neustart …"
    verify_backend_marker 60
    return
  fi
  step "Dienst-Neustart eingeplant; warte anschließend auf Health-Nachweis …"
  if ! systemd-run --user --collect --quiet \
    --unit="wrapt-restart-$(date +%s)" \
    /bin/bash "$repo_root/scripts/verify-service-restart.sh" \
      "$repo_root" "$SERVICE_UNIT" "$restart_target" "$restart_job_id" "$restart_started_at" \
      "${RESTART_LOG_FILE:-}" "$lock_dir" "${RESTART_BASELINE_BOOT_ID:-}"; then
    err "systemd-run konnte den Neustart nicht einplanen."
    err "Fallback von Hand: XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR systemctl --user restart $SERVICE_UNIT"
    return 1
  fi
  restart_handed_off=1
  log "Neustart eingeplant. Der Job meldet erst nach erfolgreichem Health-Check Abschluss."
}

health_value() {
  local key="$1" payload
  # Der Health-Check läuft gegen den konfigurierten Port; das Backend setzt
  # WRAPT_HEALTH_URL beim Spawn des Neustart-Skripts (F01-07/F03-4).
  local health_url="${WRAPT_HEALTH_URL:-http://127.0.0.1:3010}"
  payload="$(curl -fsS --max-time 2 "${health_url}/api/v1/health" 2>/dev/null)" || return 1
  printf '%s' "$payload" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\{0,1\\}\\([^\",}]*\\)\"\\{0,1\\}.*/\\1/p"
}

verify_backend_marker() {
  local timeout_seconds="$1" baseline="${RESTART_BASELINE_BOOT_ID:-}" current
  local deadline=$((SECONDS + timeout_seconds))
  while (( SECONDS < deadline )); do
    current="$(health_value bootId || true)"
    if [[ -n "$current" && ( -z "$baseline" || "$current" != "$baseline" ) ]]; then
      return 0
    fi
    sleep 1
  done
  err "Der Backend-Build lief durch, aber ein neuer Serverprozess wurde nicht nachgewiesen."
  return 1
}

verify_frontend_marker() {
  local baseline="${RESTART_BASELINE_WEB_BUILD_ID:-}" current
  local deadline=$((SECONDS + 30))
  step "Prüfe den neuen Frontend-Build …"
  while (( SECONDS < deadline )); do
    current="$(health_value webBuildId || true)"
    if [[ -n "$current" && ( -z "$baseline" || "$current" != "$baseline" ) ]]; then
      return 0
    fi
    sleep 1
  done
  err "Der neue Frontend-Build wurde vom Server nicht nachgewiesen."
  return 1
}
