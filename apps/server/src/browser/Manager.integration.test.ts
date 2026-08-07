import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserDatabase } from "./database.js";
import { BrowserManager, resolveChromiumPath } from "./Manager.js";
import type { ServerBrowserMessage } from "./protocol.js";

const chromium = (() => { try { return resolveChromiumPath("auto"); } catch { return undefined; } })();
const directories: string[] = [];
const managers: BrowserManager[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/**
 * Wartet auf eine Browsernachricht. `fromIndex` überspringt bereits empfangene
 * Nachrichten — ohne das liefert die Suche nach einem Reload wieder die alte
 * Nachricht von davor zurück.
 */
async function waitFor(
  messages: ServerBrowserMessage[],
  predicate: (message: ServerBrowserMessage) => boolean,
  fromIndex = 0,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = messages.slice(fromIndex).find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Browsernachricht wurde nicht rechtzeitig empfangen.");
}

describe.skipIf(!chromium)("persistent BrowserManager profile", () => {
  it("returns selected input and document text through the clipboard bridge", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-browser-clipboard-"));
    directories.push(directory);
    const server = createServer((request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      if (request.url === "/document") {
        response.end(`<html><body><p id="document-selection">Dokument-Link https://example.test/ä</p><script>
          const range = document.createRange();
          range.selectNodeContents(document.getElementById("document-selection"));
          getSelection().removeAllRanges();
          getSelection().addRange(range);
        </script></body></html>`);
        return;
      }
      response.end(`<html><body><input id="field" value="prefix Eingabe-Link https://input.test/😀 suffix"><script>
        const field = document.getElementById("field");
        field.focus();
        field.setSelectionRange(7, 41);
      </script></body></html>`);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const messages: ServerBrowserMessage[] = [];
    const manager = new BrowserManager({
      chromiumPath: chromium!, profilesRoot: join(directory, "profiles"),
      maxSessions: 1, startupTimeoutMilliseconds: 15_000, idleTimeoutMilliseconds: 60_000,
      allowNoSandbox: true,
      captureMaxWidth: 1_280, captureMaxHeight: 720, captureMaxScale: 1,
      captureJpegQuality: 70, captureEveryNthFrame: 3,
    });
    managers.push(manager);
    const session = (await manager.createOrAttach("owner@example.com", "clipboard-test", 640, 480, (message) => messages.push(message), "create", "clipboard-profile", url)).session;
    await waitFor(messages, (message) => message.type === "browser.state" && message.url === url);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await manager.command("owner@example.com", { type: "browser.copy", sessionId: session.id, requestId: "input-copy" });
    expect(await waitFor(messages, (message) => message.type === "browser.clipboard" && message.requestId === "input-copy")).toMatchObject({
      type: "browser.clipboard", text: "Eingabe-Link https://input.test/😀", error: null,
    });

    const documentUrl = new URL("/document", url).toString();
    await manager.command("owner@example.com", { type: "browser.navigate", sessionId: session.id, url: documentUrl });
    await waitFor(messages, (message) => message.type === "browser.state" && message.url === documentUrl);
    await manager.command("owner@example.com", { type: "browser.copy", sessionId: session.id, requestId: "document-copy" });
    expect(await waitFor(messages, (message) => message.type === "browser.clipboard" && message.requestId === "document-copy")).toMatchObject({
      type: "browser.clipboard", text: "Dokument-Link https://example.test/ä", error: null,
    });
  }, 30_000);

  it("keeps an HTTP login cookie after Chromium and manager restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-browser-profile-"));
    directories.push(directory);
    const server = createServer((request, response) => {
      const authenticated = request.headers.cookie?.includes("workbenchAuth=present") ?? false;
      if (!authenticated) response.setHeader("Set-Cookie", "workbenchAuth=present; Path=/; HttpOnly; SameSite=Lax");
      response.end(`<html><body>${authenticated ? "authenticated-session" : "first-login"}</body></html>`);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const database = new BrowserDatabase(join(directory, "workbench.sqlite"));
    const options = {
      chromiumPath: chromium!, profilesRoot: join(directory, "profiles"), database,
      maxSessions: 2, startupTimeoutMilliseconds: 15_000, idleTimeoutMilliseconds: 60_000,
      allowNoSandbox: true,
      captureMaxWidth: 1_280, captureMaxHeight: 720, captureMaxScale: 1,
      captureJpegQuality: 70, captureEveryNthFrame: 3,
    };

    const firstMessages: ServerBrowserMessage[] = [];
    const first = new BrowserManager(options);
    managers.push(first);
    const firstSession = (await first.createOrAttach("owner@example.com", "persistent-test", 640, 480, (message) => firstMessages.push(message), "first", "persistent-profile", url)).session;
    await waitFor(firstMessages, (message) => message.type === "browser.state" && message.url === url);
    // Der Zustandsbericht nach einem Reload kommt, sobald die Navigation läuft —
    // das Dokument kann dann noch das alte sein. Ein festes Warten von 150 ms traf
    // das mal und mal nicht, der Test schlug sporadisch mit "first-login" fehl.
    // Deshalb die Quelle so lange erneut abfragen, bis das neu geladene Dokument
    // da ist. Bleibt es beim alten, läuft die Schleife in den Timeout und die
    // Zusicherung darunter scheitert weiterhin ehrlich.
    const beforeReload = firstMessages.length;
    await first.command("owner@example.com", { type: "browser.reload", sessionId: firstSession.id });
    await waitFor(firstMessages, (message) => message.type === "browser.state" && message.url === url, beforeReload);

    const sourceDeadline = Date.now() + 10_000;
    let reloadedSource: ServerBrowserMessage;
    do {
      const beforeSource = firstMessages.length;
      await first.command("owner@example.com", { type: "browser.source", sessionId: firstSession.id });
      reloadedSource = await waitFor(firstMessages, (message) => message.type === "browser.source", beforeSource);
    } while (
      Date.now() < sourceDeadline &&
      reloadedSource.type === "browser.source" &&
      !reloadedSource.source.includes("authenticated-session")
    );
    expect(reloadedSource).toMatchObject({ source: expect.stringContaining("authenticated-session") });
    await first.shutdown();
    managers.splice(managers.indexOf(first), 1);

    const secondMessages: ServerBrowserMessage[] = [];
    const second = new BrowserManager(options);
    managers.push(second);
    const secondSession = (await second.createOrAttach("owner@example.com", "persistent-test", 640, 480, (message) => secondMessages.push(message), "second", "persistent-profile", url)).session;
    await waitFor(secondMessages, (message) => message.type === "browser.state" && message.url === url);
    await second.command("owner@example.com", { type: "browser.source", sessionId: secondSession.id });
    const source = await waitFor(secondMessages, (message) => message.type === "browser.source");

    expect(firstSession.id).not.toBe(secondSession.id);
    expect(source).toMatchObject({ type: "browser.source", source: expect.stringContaining("authenticated-session") });
    await second.shutdown();
    managers.splice(managers.indexOf(second), 1);
    database.close();
    // Nachlaufende CDP-Antworten (z. B. „Not attached to an active page" nach
    // dem Prozessende) treffen sonst nach Testende ein und kippen den Lauf als
    // unhandled rejection. Kurz warten, bis die Verbindung zur Ruhe kommt.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }, 30_000);
});
