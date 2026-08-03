import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationDatabase } from "./database.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Benachrichtigungsdatenbank", () => {
  it("dedupliziert Remote-Ergebnisse und verwaltet Lesestatus", () => {
    const directory = mkdtempSync(join(tmpdir(), "remote-workplace-notifications-"));
    temporaryDirectories.push(directory);
    const database = new NotificationDatabase(join(directory, "workbench.sqlite"));
    const first = database.create({ source: "hermes", category: "hermes", sourceIcon: "hermes", kind: "hermes.result", severity: "success", title: "Ergebnis", body: "fertig", remoteId: "result-1" });
    const duplicate = database.create({ source: "hermes", category: "hermes", sourceIcon: "hermes", kind: "hermes.result", severity: "success", title: "Ergebnis erneut", body: "fertig", remoteId: "result-1" });
    expect(duplicate.id).toBe(first.id);
    expect(database.list().unreadCount).toBe(1);
    database.patch(first.id, { read: true });
    expect(database.list().unreadCount).toBe(0);
    database.close();
  });

  it("blendet erledigte und verworfene Einträge sofort aus", () => {
    const directory = mkdtempSync(join(tmpdir(), "remote-workplace-notifications-"));
    temporaryDirectories.push(directory);
    const database = new NotificationDatabase(join(directory, "workbench.sqlite"));
    const resolved = database.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.input-required", severity: "warning", title: "Input", body: "wartet", remoteId: "thread:1:input" });
    const dismissed = database.create({ source: "terminal", category: "terminal", sourceIcon: "terminal", kind: "terminal.completed", severity: "success", title: "Fertig", body: "fertig" });
    database.resolveByRemoteId("t3", "agent.input-required", "thread:1:input");
    database.dismiss(dismissed.id);
    expect(database.list().notifications).toEqual([]);
    expect(database.get(resolved.id)?.state).toBe("resolved");
    expect(database.get(dismissed.id)?.state).toBe("dismissed");
    const repeated = database.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.input-required", severity: "warning", title: "Input erneut", body: "wartet wieder", remoteId: "thread:1:input" });
    expect(repeated.id).toBe(resolved.id);
    expect(repeated.state).toBe("active");
    database.close();
  });

  it("pusht verworfene Remote-Zustände beim Dienstneustart nicht erneut", () => {
    const directory = mkdtempSync(join(tmpdir(), "remote-workplace-notifications-"));
    temporaryDirectories.push(directory);
    const database = new NotificationDatabase(join(directory, "workbench.sqlite"));
    const first = database.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.plan-ready", severity: "warning", title: "Plan", body: "bereit", remoteId: "thread:1:plan:version-1" });
    database.dismiss(first.id);
    const repeated = database.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.plan-ready", severity: "warning", title: "Plan", body: "bereit", remoteId: "thread:1:plan:version-1" });
    expect(repeated.id).toBe(first.id);
    expect(repeated.state).toBe("dismissed");
    expect(database.list().notifications).toEqual([]);
    database.close();
  });

  it("löscht alle aktiven Einträge gemeinsam und behält sie als verworfen", () => {
    const directory = mkdtempSync(join(tmpdir(), "remote-workplace-notifications-"));
    temporaryDirectories.push(directory);
    const database = new NotificationDatabase(join(directory, "workbench.sqlite"));
    const first = database.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.completed", severity: "success", title: "Fertig", body: "fertig" });
    database.create({ source: "terminal", category: "terminal", sourceIcon: "terminal", kind: "terminal.failed", severity: "error", title: "Fehler", body: "fehlgeschlagen" });

    expect(database.dismissAll()).toBe(2);
    expect(database.list().notifications).toEqual([]);
    expect(database.get(first.id)?.state).toBe("dismissed");
    expect(database.dismissAll()).toBe(0);
    database.close();
  });

  it("löscht erledigte und alte gelesene Einträge nach 48 Stunden", () => {
    const directory = mkdtempSync(join(tmpdir(), "remote-workplace-notifications-"));
    temporaryDirectories.push(directory);
    const database = new NotificationDatabase(join(directory, "workbench.sqlite"), 48);
    const resolved = database.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.input-required", severity: "warning", title: "Input", body: "wartet", remoteId: "thread:2:input" });
    const read = database.create({ source: "terminal", category: "terminal", sourceIcon: "terminal", kind: "terminal.completed", severity: "success", title: "Fertig", body: "fertig" });
    database.resolveByRemoteId("t3", "agent.input-required", "thread:2:input");
    database.patch(read.id, { read: true });
    expect(database.prune(Date.now() + 49 * 3_600_000)).toBe(2);
    expect(database.get(resolved.id)).toBeNull();
    expect(database.get(read.id)).toBeNull();
    database.close();
  });
});
