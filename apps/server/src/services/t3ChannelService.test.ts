import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadWraptConfig, persistT3Channel, readConfiguredT3Channel } from "../config/wrapt-config.js";
import { channelFromVersion, parseVersionOutput } from "./t3ChannelService.js";

describe("T3-Kanal aus der Version", () => {
  it("erkennt Nightly an der Vorabversion", () => {
    expect(channelFromVersion("0.0.29-nightly.20260725.899")).toBe("nightly");
  });

  it("wertet alles ohne Nightly-Kennung als Stable", () => {
    expect(channelFromVersion("0.0.28")).toBe("stable");
  });

  it("liest die Version aus der CLI-Ausgabe", () => {
    expect(parseVersionOutput("t3 v0.0.28\n")).toBe("0.0.28");
    expect(parseVersionOutput("0.0.29-nightly.20260725.899")).toBe("0.0.29-nightly.20260725.899");
    expect(parseVersionOutput("command not found")).toBeNull();
  });
});

const baseConfig = {
  branding: { appName: "Wrapt", shortName: "Wrapt" },
  system: { user: "tester", homeDirectory: "/home/tester" },
  tailscale: { hostname: "host.ts.net", ip: "100.0.0.1", httpsPort: 8443, allowedUsers: [] },
  paths: {
    projectsRoot: "/home/tester/projects",
    orbitProjectBrowserRoot: "/home/tester",
    terminalAllowedRoots: ["/home/tester"],
    terminalDefaultCwd: "/home/tester",
    dataDir: "/home/tester/data",
    browserProfilesRoot: "/home/tester/data/browser",
    orbitBackupDir: "/home/tester/data/backups",
    orbitAssetDir: "/home/tester/data/assets",
    wraptProfilesRoot: "/home/tester/profiles",
    databasePath: "/home/tester/data/wrapt.sqlite",
  },
  cli: { codexbar: "codexbar", codex: "codex", opencode: "opencode", claude: "claude", tmux: "/usr/bin/tmux", chromium: "auto" },
  codexbar: { configPath: "/home/tester/.config/codexbar/config.json", oauthProfileHomes: [] },
};

const directories: string[] = [];

function createConfigDirectory(config: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-config-"));
  directories.push(directory);
  writeFileSync(join(directory, "wrapt.local.json"), JSON.stringify(config, null, 2), "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Kanal in der Config", () => {
  it("nimmt Stable an, wenn der t3-Abschnitt fehlt", () => {
    expect(readConfiguredT3Channel(createConfigDirectory(baseConfig))).toBe("stable");
  });

  it("schreibt den Kanal und überlebt damit einen Neustart", () => {
    const directory = createConfigDirectory(baseConfig);
    persistT3Channel(directory, "nightly");
    expect(readConfiguredT3Channel(directory)).toBe("nightly");
    persistT3Channel(directory, "stable");
    expect(readConfiguredT3Channel(directory)).toBe("stable");
  });

  it("lässt alle übrigen Werte unverändert", () => {
    const directory = createConfigDirectory({ ...baseConfig, t3: { channel: "stable", port: 3773, npmPackage: "t3" } });
    persistT3Channel(directory, "nightly");
    const written = JSON.parse(readFileSync(join(directory, "wrapt.local.json"), "utf8")) as typeof baseConfig & {
      t3: { channel: string; port: number; npmPackage: string };
    };
    expect(written.t3).toEqual({ channel: "nightly", port: 3773, npmPackage: "t3" });
    expect(written.branding).toEqual(baseConfig.branding);
    expect(loadWraptConfig(directory).paths.projectsRoot).toBe("/home/tester/projects");
  });
});
