import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, createPublicLookup, isPublicAddress, readBodyLimited } from "./public-http.js";

describe("öffentliche HTTP-Ziele", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("blockiert private oder reservierte Adresse %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "akzeptiert öffentliche Adresse %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://service.local/internal",
    "http://127.0.0.1/",
    "http://user:password@example.com/",
  ])("lehnt unsicheres Ziel %s vor dem Request ab", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow();
  });

  it("begrenzt auch Antworten ohne Content-Length während des Streamings", async () => {
    const stream = Readable.from([Buffer.from("1234"), Buffer.from("5678")]);
    await expect(readBodyLimited({
      headers: { get: () => null },
      body: Object.assign(stream, { cancel: async () => { stream.destroy(); } }),
    }, 6)).rejects.toThrow("Größenlimit");
  });

  it("liefert DNS-Ergebnisse im passenden Undici-Callback-Format", () => {
    const addresses = [{ address: "93.184.216.34", family: 4 }];
    const resolve = createPublicLookup((_hostname, _options, callback) => callback(null, addresses));
    const allResult: unknown[] = [];
    const singleResult: unknown[] = [];

    resolve("example.com", { all: true }, (...result) => allResult.push(...result));
    resolve("example.com", { all: false }, (...result) => singleResult.push(...result));

    expect(allResult).toEqual([null, addresses]);
    expect(singleResult).toEqual([null, "93.184.216.34", 4]);
  });
});
