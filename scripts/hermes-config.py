#!/usr/bin/env python3
"""Kleine, atomare Konfigurationshilfe für den Hermes-Installationslauf."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from ruamel.yaml import YAML


def write_yaml(path: Path, data: object) -> None:
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.default_flow_style = False
    with temporary.open("w", encoding="utf-8") as handle:
        yaml.dump(data, handle)
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)


def load_yaml(path: Path):
    yaml = YAML()
    yaml.preserve_quotes = True
    with path.open("r", encoding="utf-8") as handle:
        return yaml.load(handle)


def harden(path: Path, keep_allowlist: bool) -> None:
    data = load_yaml(path)
    if not isinstance(data, dict):
        raise SystemExit("Die Hermes-Konfiguration ist kein YAML-Objekt.")
    approvals = data.setdefault("approvals", {})
    if not isinstance(approvals, dict):
        raise SystemExit("Der approvals-Abschnitt der Hermes-Konfiguration ist ungültig.")
    approvals["mode"] = "ask"
    approvals.setdefault("timeout", 60)
    approvals.setdefault("cron_mode", "deny")
    approvals.setdefault("mcp_reload_confirm", True)
    approvals["destructive_slash_confirm"] = True
    before = data.get("command_allowlist", [])
    if not isinstance(before, list):
        before = []
    if not keep_allowlist:
        data["command_allowlist"] = []
    write_yaml(path, data)
    print(f"Hermes-Approval-Härtung: mode=ask, command_allowlist {len(before)} -> {len(data['command_allowlist'])} Einträge.")


def theme(path: Path, name: str) -> None:
    data = load_yaml(path)
    if not isinstance(data, dict):
        raise SystemExit("Die Hermes-Konfiguration ist kein YAML-Objekt.")
    dashboard = data.setdefault("dashboard", {})
    if not isinstance(dashboard, dict):
        raise SystemExit("Der dashboard-Abschnitt der Hermes-Konfiguration ist ungültig.")
    dashboard["theme"] = name
    write_yaml(path, data)
    print(f"Hermes-Dashboard-Theme aktiviert: {name}")


parser = argparse.ArgumentParser()
subparsers = parser.add_subparsers(dest="command", required=True)
harden_parser = subparsers.add_parser("harden")
harden_parser.add_argument("path", type=Path)
harden_parser.add_argument("--keep-allowlist", action="store_true")
theme_parser = subparsers.add_parser("theme")
theme_parser.add_argument("path", type=Path)
theme_parser.add_argument("name")
args = parser.parse_args()

if args.command == "harden":
    harden(args.path, args.keep_allowlist)
else:
    theme(args.path, args.name)
