#!/usr/bin/env bash
# Wrapt — Abhängigkeiten prüfen/installieren und Projekt bauen.
# Idempotent: mehrfaches Ausführen ist unschädlich. Wird vom Agent-Setup
# (docs/agent-setup.md) oder manuell aufgerufen.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

# --- Node >= 22 --------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  err "Node.js wurde nicht gefunden. Bitte Node >= 22 installieren (https://nodejs.org)."
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  err "Node >= 22 erforderlich, gefunden: $(node -v)."
  exit 1
fi
log "Node $(node -v) ok."

# --- pnpm 10 -----------------------------------------------------------------
if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm nicht gefunden — aktiviere es über Corepack."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@10 --activate || true
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm konnte nicht bereitgestellt werden. Bitte manuell installieren: npm i -g pnpm@10"
  exit 1
fi
log "pnpm $(pnpm -v) ok."

# --- Optionale Systemwerkzeuge (nur Hinweise) --------------------------------
command -v tmux     >/dev/null 2>&1 || warn "tmux fehlt — wird für Terminal-Sessions benötigt (apt install tmux)."
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1; then
  warn "Chromium/Chrome fehlt — wird für das Browser-Tool benötigt (apt install chromium)."
fi

# --- Konfiguration prüfen ----------------------------------------------------
if [[ ! -f config/wrapt.local.json && ! -f config/workbench.local.json ]]; then
  warn "config/wrapt.local.json fehlt. Kopiere Vorlage — bitte anschließend mit echten Werten füllen."
  cp config/wrapt.example.json config/wrapt.local.json
elif [[ ! -f config/wrapt.local.json ]]; then
  warn "Legacy-Config config/workbench.local.json bleibt erhalten und wird beim nächsten Wrapt-Start sicher migriert."
fi
if [[ ! -f .env ]]; then
  warn ".env fehlt. Kopiere .env.example — bitte MISTRAL_API_KEY optional ergänzen."
  cp .env.example .env
fi

# --- Install + Build ---------------------------------------------------------
log "Installiere Abhängigkeiten (pnpm install)…"
pnpm install

log "Baue Projekt (pnpm build)…"
pnpm build

log "Fertig. Start mit 'pnpm dev' (Entwicklung) oder 'pnpm start' (Produktion)."
log "Health-Check nach dem Start: http://127.0.0.1:3010/api/v1/health"
