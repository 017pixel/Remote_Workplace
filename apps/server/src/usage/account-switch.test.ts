import { lstat, mkdir, mkdtemp, readFile, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AccountSwitch } from "./account-switch.js";

/** Baut eine Codex-auth.json, deren id_token die geprüften Claims trägt. */
async function writeCodexAuth(profilePath: string, options: { email: string; accountId: string; plan?: string; marker?: string }) {
  await mkdir(profilePath, { recursive: true });
  const claims = Buffer.from(JSON.stringify({ email: options.email, "https://api.openai.com/auth": { chatgpt_plan_type: options.plan ?? "plus" } })).toString("base64url");
  await writeFile(join(profilePath, "auth.json"), JSON.stringify({
    tokens: { id_token: `header.${claims}.signature`, account_id: options.accountId, marker: options.marker ?? "original" },
  }));
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "account-switch-"));
  const layouts = {
    codex: { sharedHome: join(root, ".codex"), authFileName: "auth.json" },
    claude: { sharedHome: join(root, ".claude"), authFileName: ".credentials.json" },
    opencode: { sharedHome: join(root, "share/opencode"), authFileName: "auth.json" },
  };
  for (const layout of Object.values(layouts)) await mkdir(layout.sharedHome, { recursive: true });
  return { root, layouts, switcher: new AccountSwitch(layouts) };
}

describe("account switch", () => {
  it("reads identity and plan from each tool's own credential format", async () => {
    const { root, switcher } = await setup();
    const codex = join(root, "store-codex");
    await writeCodexAuth(codex, { email: "work@example.com", accountId: "acct-work", plan: "pro" });
    await expect(switcher.identity("codex", codex)).resolves.toMatchObject({ email: "work@example.com", plan: "pro" });

    const claude = join(root, "store-claude");
    await mkdir(claude, { recursive: true });
    await writeFile(join(claude, ".credentials.json"), JSON.stringify({ claudeAiOauth: { subscriptionType: "max" } }));
    await expect(switcher.identity("claude", claude)).resolves.toMatchObject({ plan: "max" });

    const opencode = join(root, "store-opencode");
    await mkdir(opencode, { recursive: true });
    await writeFile(join(opencode, "auth.json"), JSON.stringify({ "opencode-go": { type: "api" }, google: { type: "api" } }));
    await expect(switcher.identity("opencode", opencode)).resolves.toMatchObject({ plan: "2 Anbieter" });
  });

  it("switches the active codex account back and forth without a new login", async () => {
    const { root, layouts, switcher } = await setup();
    const privateStore = join(root, "store-private");
    const workStore = join(root, "store-work");
    await writeCodexAuth(privateStore, { email: "private@example.com", accountId: "acct-private" });
    await writeCodexAuth(workStore, { email: "work@example.com", accountId: "acct-work" });

    await switcher.activate("codex", workStore, [privateStore, workStore]);
    await expect(switcher.activeProfilePath("codex")).resolves.toBe(workStore);
    expect(JSON.parse(await readFile(join(layouts.codex.sharedHome, "auth.json"), "utf8")).tokens.account_id).toBe("acct-work");

    await switcher.activate("codex", privateStore, [privateStore, workStore]);
    await expect(switcher.activeProfilePath("codex")).resolves.toBe(privateStore);
    expect(JSON.parse(await readFile(join(layouts.codex.sharedHome, "auth.json"), "utf8")).tokens.account_id).toBe("acct-private");
  });

  it("switches Claude Code using its own credential file name", async () => {
    const { root, layouts, switcher } = await setup();
    const store = join(root, "store-claude");
    await mkdir(store, { recursive: true });
    await writeFile(join(store, ".credentials.json"), JSON.stringify({ claudeAiOauth: { subscriptionType: "pro" } }));

    await switcher.activate("claude", store, [store]);

    await expect(readlink(join(layouts.claude.sharedHome, ".credentials.json"))).resolves.toBe(join(store, ".credentials.json"));
    await expect(switcher.activeProfilePath("claude")).resolves.toBe(store);
  });

  it("keeps refreshed tokens in the owning store when the tool writes through the link", async () => {
    const { root, layouts, switcher } = await setup();
    const store = join(root, "store-opencode");
    await mkdir(store, { recursive: true });
    await writeFile(join(store, "auth.json"), JSON.stringify({ anthropic: { type: "api", key: "a" } }));
    await switcher.activate("opencode", store, [store]);

    // OpenCode schreibt nachweislich durch den Symlink hindurch — das bildet den Fall ab.
    await writeFile(join(layouts.opencode.sharedHome, "auth.json"), JSON.stringify({ google: { type: "api", key: "b" } }));
    expect((await lstat(join(layouts.opencode.sharedHome, "auth.json"))).isSymbolicLink()).toBe(true);
    expect(JSON.parse(await readFile(join(store, "auth.json"), "utf8"))).toEqual({ google: { type: "api", key: "b" } });
  });

  it("repairs a link that a tool replaced with a plain file, keeping the newer credentials", async () => {
    const { root, layouts, switcher } = await setup();
    const store = join(root, "store-claude");
    await mkdir(store, { recursive: true });
    await writeFile(join(store, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "alt" } }));
    await switcher.activate("claude", store, [store]);

    // Claude Code ersetzt den Symlink beim Abmelden; ein Neuanmelden legt dann eine reguläre
    // Datei an. Deren Zugangsdaten sind die neueren und dürfen nicht verloren gehen.
    const shared = join(layouts.claude.sharedHome, ".credentials.json");
    await writeFile(`${shared}.neu`, JSON.stringify({ claudeAiOauth: { accessToken: "neu" } }));
    const { rename, unlink } = await import("node:fs/promises");
    await unlink(shared);
    await rename(`${shared}.neu`, shared);
    expect((await lstat(shared)).isSymbolicLink()).toBe(false);

    await expect(switcher.repair("claude", store)).resolves.toBe(true);

    expect((await lstat(shared)).isSymbolicLink()).toBe(true);
    expect(JSON.parse(await readFile(join(store, ".credentials.json"), "utf8")).claudeAiOauth.accessToken).toBe("neu");
  });

  it("adopts a pre-existing plain auth file into the matching account store", async () => {
    const { root, layouts, switcher } = await setup();
    const privateStore = join(root, "store-private");
    const workStore = join(root, "store-work");
    await writeCodexAuth(privateStore, { email: "private@example.com", accountId: "acct-private", marker: "veraltet" });
    await writeCodexAuth(workStore, { email: "work@example.com", accountId: "acct-work" });
    await writeCodexAuth(layouts.codex.sharedHome, { email: "private@example.com", accountId: "acct-private", marker: "aktuell" });

    const result = await switcher.activate("codex", workStore, [privateStore, workStore]);

    expect(result.adoptedInto).toBe(privateStore);
    expect(JSON.parse(await readFile(join(privateStore, "auth.json"), "utf8")).tokens.marker).toBe("aktuell");
    expect(JSON.parse(await readFile(result.backupPath!, "utf8")).tokens.marker).toBe("veraltet");
  });

  it("moves a shared home account into its own store", async () => {
    const { root, layouts, switcher } = await setup();
    await writeFile(join(layouts.opencode.sharedHome, "auth.json"), JSON.stringify({ "opencode-go": { type: "api", key: "k" } }));
    const store = join(root, "profiles/opencode/go");

    await switcher.moveSharedHomeIntoStore("opencode", store);
    await switcher.activate("opencode", store, [store]);

    expect(JSON.parse(await readFile(join(store, "auth.json"), "utf8"))["opencode-go"].key).toBe("k");
    await expect(switcher.activeProfilePath("opencode")).resolves.toBe(store);
  });

  it("refuses profiles without credentials and the shared home itself", async () => {
    const { root, layouts, switcher } = await setup();
    const empty = join(root, "store-empty");
    await mkdir(empty, { recursive: true });
    await expect(switcher.activate("codex", empty, [])).rejects.toMatchObject({ code: "ACCOUNT_NOT_AUTHENTICATED" });
    await expect(switcher.activate("codex", layouts.codex.sharedHome, [])).rejects.toMatchObject({ code: "PROFILE_IS_SHARED_HOME" });
  });
});
