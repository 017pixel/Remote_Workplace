#!/usr/bin/env bash
# Gemeinsame Helfer für die Neustart-Skripte (restart-frontend/-backend/-all.sh).
# Wird per `source` eingebunden, nicht direkt ausgeführt.

SERVICE_UNIT="workbench.service"

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
restart_target="${RESTART_TARGET:-unbekannt}"
restart_started_at="$(date -Is)"
restart_last_step="Start"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Schreibt den Zustand des Laufs als JSON. Das Backend liest die Datei für
# GET /api/v1/system/restart/status — so zeigt das UI den echten Fehler
# statt nur in einen Timeout zu laufen.
write_status() {
  local phase="$1" exit_code="$2" message="$3"
  mkdir -p "$status_dir" 2>/dev/null || return 0
  cat > "$status_file" <<JSON
{
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
}

step() { restart_last_step="$*"; log "$*"; }

on_exit() {
  local code="$?"
  if [[ "$code" -eq 0 ]]; then
    write_status "succeeded" 0 "Neustart abgeschlossen."
  else
    write_status "failed" "$code" "Abbruch bei: ${restart_last_step} (Exit-Code ${code}). Details stehen im Log."
    err "Abbruch bei: ${restart_last_step} (Exit-Code ${code})"
  fi
}

# Muss von jedem Skript direkt nach dem `source` aufgerufen werden.
restart_begin() {
  restart_target="$1"
  trap on_exit EXIT
  write_status "running" 0 "Läuft …"
  log "Ziel: $restart_target — Projekt: $repo_root"
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
  step "Baue @workbench/contracts …"
  run_pnpm --filter @workbench/contracts build
}

build_frontend() {
  step "Baue Frontend (@workbench/web) …"
  run_pnpm --filter @workbench/web build
}

build_backend() {
  step "Baue Backend (@workbench/server) …"
  run_pnpm --filter @workbench/server build
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

# Plant den Dienst-Neustart in einer eigenen, transienten systemd-Einheit ein.
# Nötig, weil der Aufrufer (Server-Prozess oder ein Workbench-Terminal) selbst in der
# Cgroup von workbench.service liegen kann — ein direkter Neustart würde ihn mitten im
# Ablauf killen. Die transiente Einheit läuft außerhalb dieser Cgroup und überlebt.
schedule_service_restart() {
  step "Plane Neustart von $SERVICE_UNIT ein …"
  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl nicht verfügbar — bitte den Dienst manuell neu starten."
    return 0
  fi
  if ! systemctl --user is-enabled "$SERVICE_UNIT" >/dev/null 2>&1; then
    warn "$SERVICE_UNIT ist nicht als User-Dienst aktiv. Läuft die Workbench im Dev-Modus (pnpm dev),"
    warn "startet tsx watch das Backend nach dem Build automatisch neu — dann ist kein Neustart nötig."
    return 0
  fi
  # Der Lauf gilt ab hier als erfolgreich: gleich wird der Prozess, der dieses Skript
  # gestartet hat, mit neu gestartet — danach käme niemand mehr zum Schreiben des Status.
  write_status "succeeded" 0 "Build fertig, Dienst-Neustart eingeplant."
  if ! systemd-run --user --collect --quiet \
    --unit="workbench-restart-$(date +%s)" \
    /bin/bash -c "sleep 1; systemctl --user restart $SERVICE_UNIT"; then
    err "systemd-run konnte den Neustart nicht einplanen."
    err "Fallback von Hand: XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR systemctl --user restart $SERVICE_UNIT"
    return 1
  fi
  log "Neustart eingeplant. Der Dienst ist in wenigen Sekunden wieder erreichbar."
}
