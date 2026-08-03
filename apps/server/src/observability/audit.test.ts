import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isAuditedMutation, OperationalAuditDatabase } from "./audit.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("OperationalAuditDatabase", () => {
  it("chains entries and stores only a pseudonymized actor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-audit-"));
    directories.push(directory);
    const path = join(directory, "workbench.sqlite");
    const audit = new OperationalAuditDatabase(path);
    audit.record({ requestId: "request-1", actor: "person@example.com", action: "PUT /orbit", target: "/api/v1/orbit", statusCode: 200 });
    audit.record({ requestId: "request-2", actor: "person@example.com", action: "DELETE /files/:id", target: "/api/v1/files/id", statusCode: 204 });
    expect(audit.verify()).toMatchObject({ valid: true, entries: 2 });
    audit.close();

    const database = new DatabaseSync(path);
    const rows = database.prepare("SELECT actor, previous_hash previousHash, entry_hash entryHash FROM operational_audit ORDER BY sequence").all() as Array<{ actor: string; previousHash: string | null; entryHash: string }>;
    expect(rows[0]?.actor).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.actor).not.toContain("person");
    expect(rows[1]?.previousHash).toBe(rows[0]?.entryHash);
    database.close();
  });

  it("covers destructive and administrative route families without auditing reads", () => {
    expect(isAuditedMutation("PUT", "/api/v1/orbit")).toBe(true);
    expect(isAuditedMutation("POST", "/api/v1/projects/test/files")).toBe(true);
    expect(isAuditedMutation("DELETE", "/api/v1/previews/storage/profile")).toBe(true);
    expect(isAuditedMutation("GET", "/api/v1/orbit")).toBe(false);
  });
});
