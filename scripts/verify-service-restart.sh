#!/usr/bin/env bash
# Läuft in einer transienten User-systemd-Unit außerhalb der Workbench-Cgroup.
# Erfolg wird erst nach einem neuen, gesunden Serverprozess veröffentlicht.
set -euo pipefail

repo_root="$1"
service_unit="$2"
restart_target="$3"
restart_job_id="$4"
restart_started_at="$5"
restart_log_file="$6"
lock_dir="$7"
baseline_boot_id="$8"
status_dir="$repo_root/data/restart-logs"
status_file="$status_dir/last-status.json"
restart_last_step="Starte $service_unit neu"

if [[ -n "$restart_log_file" ]]; then
  exec >>"$restart_log_file" 2>&1
fi

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

write_status() {
  local phase="$1" exit_code="$2" message="$3"
  local temporary="$status_file.$$.$RANDOM.tmp"
  mkdir -p "$status_dir"
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
  "logFile": "$(json_escape "$restart_log_file")"
}
JSON
  chmod 600 "$temporary" 2>/dev/null || true
  mv -f "$temporary" "$status_file"
}

release_lock() {
  rm -f "$lock_dir/owner" 2>/dev/null || true
  rmdir "$lock_dir" 2>/dev/null || true
}

fail() {
  local code="$?"
  write_status "failed" "$code" "Der Dienst-Neustart oder sein Health-Check ist fehlgeschlagen."
  release_lock
  exit "$code"
}
trap fail ERR

write_status "running" "null" "Der Dienst wird neu gestartet …"
systemctl --user restart "$service_unit"

restart_last_step="Prüfe Health und neuen Serverprozess"
write_status "running" "null" "Warte auf den neuen Serverprozess …"
deadline=$((SECONDS + 90))
# Der Health-Check läuft gegen den konfigurierten Port (F01-07/F03-4).
health_url="${WRAPT_HEALTH_URL:-http://127.0.0.1:3010}/api/v1/health"
while (( SECONDS < deadline )); do
  health="$(curl -fsS --max-time 2 "$health_url" 2>/dev/null || true)"
  current_boot_id="$(printf '%s' "$health" | sed -n 's/.*"bootId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [[ -n "$current_boot_id" && ( -z "$baseline_boot_id" || "$current_boot_id" != "$baseline_boot_id" ) ]]; then
    write_status "succeeded" 0 "Neustart und Health-Check abgeschlossen."
    release_lock
    trap - ERR
    exit 0
  fi
  sleep 1
done

echo "[fehler] Der Dienst meldete innerhalb von 90 Sekunden keinen neuen gesunden Prozess." >&2
false
