import { afterEach, describe, expect, it, vi } from "vitest";
import { HermesSessionToken, HermesTokenError } from "./token.js";

afterEach(() => vi.unstubAllGlobals());

describe("Hermes-Session-Token", () => {
  it("liest und cached das ephemere Token aus dem Dashboard-HTML", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('<script>window.__HERMES_SESSION_TOKEN__="token_1234567890123456"</script>', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const token = new HermesSessionToken();
    await expect(token.get()).resolves.toBe("token_1234567890123456");
    await expect(token.get()).resolves.toBe("token_1234567890123456");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    token.invalidate();
    await token.get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("weist fehlende Token sichtbar als Fehler aus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 })));
    await expect(new HermesSessionToken().get()).rejects.toBeInstanceOf(HermesTokenError);
  });
});
