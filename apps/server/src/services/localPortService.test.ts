import { describe, expect, it } from "vitest";
import { parseListeningSockets } from "./localPortService.js";

describe("local port discovery", () => {
  it("deduplicates IPv4 and IPv6 listeners and keeps process names", () => {
    const sockets = parseListeningSockets([
      'LISTEN 0 511 127.0.0.1:3010 0.0.0.0:* users:(("node",pid=123,fd=4))',
      'LISTEN 0 4096 0.0.0.0:7000 0.0.0.0:*',
      'LISTEN 0 4096 [::]:7000 [::]:*',
    ].join("\n"));
    expect(sockets).toEqual([
      { address: "127.0.0.1", port: 3010, process: "node" },
      { address: "0.0.0.0", port: 7000, process: null },
    ]);
  });
});
