#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="${CONFIG_DIR:-$repo_root/config}"
config_file="$config_dir/wrapt.local.json"
if [[ ! -f "$config_file" && -f "$config_dir/workbench.local.json" ]]; then config_file="$config_dir/workbench.local.json"; elif [[ ! -f "$config_file" ]]; then config_file="$config_dir/wrapt.example.json"; fi

config_value() {
  local key="$1"
  node -e 'const fs=require("node:fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); let v=c; for (const k of process.argv[2].split(".")) v=v?.[k]; if (v !== undefined && v !== null) process.stdout.write(String(v));' "$config_file" "$key"
}

data_dir="$(config_value paths.dataDir)"
hermes_home="${HERMES_HOME:-$(config_value hermes.homeDirectory 2>/dev/null || true)}"
hermes_home="${hermes_home:-$HOME/.hermes}"
checkout="$(config_value hermes.checkoutDirectory 2>/dev/null || true)"
checkout="${checkout:-$hermes_home/hermes-agent}"
cli_config="$(config_value hermes.cliPath 2>/dev/null || true)"
cli="${HERMES_CLI_PATH:-${cli_config:-$(command -v hermes || true)}}"
python_path="$(config_value hermes.pythonPath 2>/dev/null || true)"
python_path="${python_path:-$checkout/venv/bin/python}"
npm_cmd=(npm)
npm_major="$(npm --version | cut -d. -f1)"
if [[ "$npm_major" -lt 12 ]]; then npm_cmd=(npx --yes npm@12); fi
state_file="$data_dir/hermes/update-state.json"
lock_file="$data_dir/hermes/update.lock"
force_marker="$data_dir/hermes/update-force"
log_file="$(mktemp)"
cleanup() { rm -f "$log_file"; }
trap cleanup EXIT

mkdir -p "$(dirname "$state_file")"
exec {lock_fd}>"$lock_file"
if ! flock -n "$lock_fd"; then exit 0; fi
force_update="${HERMES_UPDATE_FORCE:-0}"
if [[ -f "$force_marker" ]]; then
  force_update=1
  rm -f "$force_marker"
fi

state() {
  local -a fields=()
  local field
  for field in "$@"; do
    if [[ "$field" == HERMES_UPDATE_LOG_TAIL_FILE=* ]]; then
      export HERMES_UPDATE_LOG_TAIL_FILE="${field#*=}"
    else
      fields+=("$field")
    fi
  done
  node "$repo_root/scripts/hermes-update-state.mjs" "$state_file" "${fields[@]}"
}
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
safe_tail() {
  local redacted_file
  redacted_file="$(mktemp)"
  if [[ -s "$1" ]]; then
    sed -E 's/(api[_-]?key|token|secret|password|authorization)([[:space:]]*[:=][[:space:]]*)[^[:space:],;]+/\1\2[redigiert]/Ig' "$1" | tail -40 > "$redacted_file"
  else
    : > "$redacted_file"
  fi
  mv -f "$redacted_file" "$log_file"
}
run_quiet() { : > "$log_file"; "$@" >"$log_file" 2>&1; }
restart_services() {
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  systemctl --user restart hermes-dashboard.service >/dev/null 2>&1 || true
  systemctl --user restart hermes-gateway.service >/dev/null 2>&1 || true
}
version() { "$cli" version 2>/dev/null | head -1 | sed -E 's/.*Hermes Agent v([^ ]+).*/\1/' || true; }
commit() { git -C "$checkout" rev-parse HEAD 2>/dev/null || true; }

if [[ -z "$cli" || ! -x "$cli" ]]; then
  state "phase=failed" "lastFinishedAt=$(now)" "lastResult=failed" "pending=false" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 1
fi

state "phase=checking" "lastCheckedAt=$(now)" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
previous_version="$(version)"
previous_commit="$(commit)"
if ! run_quiet "$cli" update --check; then
  safe_tail "$log_file"
  state "phase=failed" "lastFinishedAt=$(now)" "lastResult=failed" "pending=false" "previousVersion=$previous_version" "previousCommit=$previous_commit" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 1
fi
if ! grep -Eiq 'update available|new version|behind|upgrade available' "$log_file"; then
  state "phase=idle" "pending=false" "lastResult=none" "lastFinishedAt=$(now)" "previousVersion=$previous_version" "previousCommit=$previous_commit" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 0
fi

dashboard_token=""
if [[ -x "$python_path" ]]; then
  dashboard_html="$(curl -fsS --max-time 10 -H "Host: 127.0.0.1:9119" http://127.0.0.1:9119/ 2>/dev/null || true)"
  dashboard_token="$(printf '%s' "$dashboard_html" | sed -n 's/.*__HERMES_SESSION_TOKEN__="\([A-Za-z0-9_-]\{16,\}\)".*/\1/p' | head -1)"
fi
busy=false
if [[ -n "$dashboard_token" ]]; then
  dashboard_status="$(curl -fsS --max-time 10 -H "Host: 127.0.0.1:9119" http://127.0.0.1:9119/api/status 2>/dev/null || true)"
  sessions="$(curl -fsS --max-time 10 -H "Host: 127.0.0.1:9119" -H "X-Hermes-Session-Token: $dashboard_token" 'http://127.0.0.1:9119/api/sessions?limit=20' 2>/dev/null || true)"
  cron_jobs="$(curl -fsS --max-time 10 -H "Host: 127.0.0.1:9119" -H "X-Hermes-Session-Token: $dashboard_token" 'http://127.0.0.1:9119/api/cron/jobs' 2>/dev/null || true)"
  if printf '%s' "$dashboard_status" | grep -Eiq '"(gateway_busy)"[[:space:]]*:[[:space:]]*true|"active_(agents|sessions)"[[:space:]]*:[[:space:]]*[1-9]'; then busy=true; fi
  if printf '%s\n%s' "$sessions" "$cron_jobs" | grep -Eiq '"(status|last_status)"[[:space:]]*:[[:space:]]*"running"'; then busy=true; fi
fi
if [[ "$busy" == true && "$force_update" != "1" ]]; then
  state "phase=pending" "pending=true" "deferredSince=$(now)" "lastResult=deferred" "previousVersion=$previous_version" "previousCommit=$previous_commit" "lastCheckedAt=$(now)" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 0
fi

state "phase=running" "pending=false" "lastStartedAt=$(now)" "previousVersion=$previous_version" "previousCommit=$previous_commit" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
last_full_backup_at="$(node -e 'const fs=require("node:fs"); try { const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(s.lastFullBackupAt||"")); } catch {}' "$state_file")"
backup_due=true
if [[ -n "$last_full_backup_at" ]] && [[ "$last_full_backup_at" > "$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" ]]; then backup_due=false; fi
if [[ "$backup_due" == true ]]; then
  if run_quiet "$cli" backup; then
    state "lastFullBackupAt=$(now)" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  else
    safe_tail "$log_file"
    restart_services
    state "phase=failed" "lastFinishedAt=$(now)" "lastResult=failed" "pending=false" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
    exit 1
  fi
fi
if ! run_quiet "$cli" update --yes --backup; then
  safe_tail "$log_file"
  restart_services
  state "phase=failed" "lastFinishedAt=$(now)" "lastResult=failed" "pending=false" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 1
fi
# Hermes ist ein npm-Workspace. Die Installation muss am Checkout-Root laufen,
# damit die dort gepflegte allowScripts-Liste und der gemeinsame Lockfile gelten.
if ! run_quiet "${npm_cmd[@]}" --prefix "$checkout" install --workspace web --no-audit --no-fund --prefer-offline || ! run_quiet "${npm_cmd[@]}" --prefix "$checkout/web" run build; then
  safe_tail "$log_file"
  restart_services
  state "phase=failed" "lastFinishedAt=$(now)" "lastResult=failed" "pending=false" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 1
fi

restart_services
healthy=false
for _ in {1..120}; do
  if curl -fsS --max-time 2 -H "Host: 127.0.0.1:9119" http://127.0.0.1:9119/api/status >/dev/null 2>&1; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]] || ! systemctl --user is-active --quiet hermes-gateway.service; then
  safe_tail "$log_file"
  state "phase=failed" "lastFinishedAt=$(now)" "lastResult=failed" "pending=false" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
  exit 1
fi
run_quiet "$cli" doctor || true
state "phase=succeeded" "pending=false" "lastFinishedAt=$(now)" "lastResult=success" "newVersion=$(version)" "newCommit=$(commit)" "deferredSince=null" "HERMES_UPDATE_LOG_TAIL_FILE=$log_file"
