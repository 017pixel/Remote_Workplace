import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CodexbarClient } from "./codexbar-client.js";

const directories: string[] = [];

afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("CodexbarClient", () => {
  it("falls back to the local CLI when the long-running HTTP listener is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '[{"provider":"opencodego","source":"web","usage":{"primary":{"usedPercent":12,"windowMinutes":300}}}]'\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });
    await expect(client.getUsage("opencodego")).resolves.toEqual([
      expect.objectContaining({ provider: "opencodego", usage: expect.objectContaining({ primary: expect.objectContaining({ usedPercent: 12 }) }) }),
    ]);
  });

  it("falls back to the local CLI when the HTTP service returns a provider error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-provider-error-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '[{"provider":"opencodego","source":"web","usage":{"primary":{"usedPercent":0,"windowMinutes":300}}}]'\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({
      baseUrl: "http://127.0.0.1:18181",
      timeoutMilliseconds: 100,
      cliPath: executable,
      fetchImplementation: async () => new Response('[{"provider":"opencodego","source":"auto","error":{"code":1,"message":"usage timed out"}}]'),
    });

    await expect(client.getUsage("opencodego")).resolves.toEqual([
      expect.objectContaining({ provider: "opencodego", usage: expect.objectContaining({ primary: expect.objectContaining({ usedPercent: 0 }) }) }),
    ]);
  });

  it("retains valid partial JSON even when one Codex profile makes the CLI exit non-zero", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-partial-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '[{"provider":"codex","source":"oauth","account":"main@example.com","usage":{"secondary":{"usedPercent":28,"windowMinutes":10080}}},{"provider":"codex","source":"auto","account":"main@example.com","error":{"code":1,"message":"expired"}}]'\nexit 1\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });
    await expect(client.getUsage("codex")).resolves.toHaveLength(2);
  });

  it("prefers the explicit Codex multi-account CLI result over a single-account HTTP response", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-all-accounts-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '[{"provider":"codex","account":"main@example.com","usage":{"primary":{"usedPercent":10}}},{"provider":"codex","account":"work@example.com","usage":{"primary":{"usedPercent":20}}}]'\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({
      baseUrl: "http://127.0.0.1:18181",
      timeoutMilliseconds: 100,
      cliPath: executable,
      fetchImplementation: async () => new Response('[{"provider":"codex","account":"main@example.com","usage":{"primary":{"usedPercent":10}}}]'),
    });

    const result = await client.getUsage("codex");
    expect(result.map((item) => item.account)).toEqual(["main@example.com", "work@example.com"]);
  });

  it("falls back to the Claude CLI source and enriches it with the local account", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-claude-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    const claude = join(directory, "claude");
    await writeFile(executable, `#!/bin/sh\ncase "$*" in\n  *"--source oauth"*) printf '%s' 'not-json'; exit 1;;\n  *) printf '%s' '[{"provider":"claude","source":"claude","usage":{"primary":{"usedPercent":15,"windowMinutes":300}}}]';;\nesac\n`);
    await writeFile(claude, `#!/bin/sh\nprintf '%s' '{"loggedIn":true,"email":"claude@example.com","subscriptionType":"pro"}'\n`);
    await Promise.all([chmod(executable, 0o700), chmod(claude, 0o700)]);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable, claudeCliPath: claude });

    await expect(client.getUsage("claude")).resolves.toEqual([
      expect.objectContaining({
        provider: "claude",
        usage: expect.objectContaining({
          accountEmail: "claude@example.com",
          loginMethod: "Claude pro",
          primary: expect.objectContaining({ usedPercent: 15 }),
        }),
      }),
    ]);
  });

  it("reads each isolated Claude profile with its own config dir", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-claude-profiles-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' "$CLAUDE_CONFIG_DIR|$CLAUDE_SECURESTORAGE_CONFIG_DIR" | grep -q "/profile-b" && printf '%s' '[{"provider":"claude","source":"oauth","usage":{"secondary":{"usedPercent":34,"windowMinutes":10080,"resetsAt":"2026-08-01T20:00:00Z"}}}]' || printf '%s' '[{"provider":"claude","source":"oauth","error":{"code":1,"message":"no credentials"}}]'\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });

    const results = await client.getClaudeUsageForProfiles(["/home/test/profile-a", "/home/test/profile-b"]);

    expect(results).toHaveLength(2);
    const a = results.find((entry) => entry.profilePath === "/home/test/profile-a");
    const b = results.find((entry) => entry.profilePath === "/home/test/profile-b");
    expect(a?.payload.error?.code).toBe(1);
    expect(b?.payload.usage?.secondary?.usedPercent).toBe(34);
  });

  it("isolates a failing Claude profile without breaking the others", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-claude-profiles-fail-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nexit 3\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });

    const results = await client.getClaudeUsageForProfiles(["/home/test/profile-a", "/home/test/profile-b"], 1);

    expect(results).toHaveLength(2);
    for (const entry of results) {
      expect(entry.payload.error?.message).toContain("Claude-Profil");
    }
  });

  it("deduplicates profile paths and caps the concurrency", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-claude-profiles-conc-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '[{"provider":"claude","source":"oauth","usage":{"secondary":{"usedPercent":1,"windowMinutes":10080}}}]'\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });

    const results = await client.getClaudeUsageForProfiles(["/home/test/profile-a", "/home/test/profile-a", "/home/test/profile-b"], 1);

    expect(results).toHaveLength(2);
  });

  it("prefers all OpenCode Go token accounts, falling back to the single read without them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-opencodego-all-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    // All-accounts liefert Fehler (keine Token-Accounts), Einzelabruf liefert Usage.
    await writeFile(executable, `#!/bin/sh\ncase "$*" in\n  *"--all-accounts"*) printf '%s' '[{"provider":"opencodego","source":"auto","error":{"code":1,"message":"No token accounts configured for opencodego."}}]';;\n  *) printf '%s' '[{"provider":"opencodego","source":"web","usage":{"primary":{"usedPercent":0,"windowMinutes":300},"secondary":{"usedPercent":61,"windowMinutes":10080}}}]';;\nesac\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });

    await expect(client.getOpenCodeGoUsage()).resolves.toEqual([
      expect.objectContaining({ provider: "opencodego", usage: expect.objectContaining({ secondary: expect.objectContaining({ usedPercent: 61 }) }) }),
    ]);
  });

  it("returns every OpenCode Go token account when all-accounts has usage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexbar-client-opencodego-multi-"));
    directories.push(directory);
    const executable = join(directory, "codexbar");
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '[{"provider":"opencodego","source":"web","account":"one@example.com","usage":{"secondary":{"usedPercent":20,"windowMinutes":10080}}},{"provider":"opencodego","source":"web","account":"two@example.com","usage":{"secondary":{"usedPercent":80,"windowMinutes":10080}}}]'\n`);
    await chmod(executable, 0o700);
    const client = new CodexbarClient({ baseUrl: "http://127.0.0.1:1", timeoutMilliseconds: 100, cliPath: executable });

    const result = await client.getOpenCodeGoUsage();
    expect(result.map((item) => item.account)).toEqual(["one@example.com", "two@example.com"]);
  });
});
