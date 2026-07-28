import { describe, expect, it } from "vitest";
import { isProjectSocket, parseListeningSockets } from "./localPortService.js";

describe("local port discovery", () => {
  it("deduplicates IPv4 and IPv6 listeners and keeps process names", () => {
    const sockets = parseListeningSockets([
      'LISTEN 0 511 127.0.0.1:3010 0.0.0.0:* users:(("node",pid=123,fd=4))',
      'LISTEN 0 4096 0.0.0.0:7000 0.0.0.0:*',
      'LISTEN 0 4096 [::]:7000 [::]:*',
    ].join("\n"));
    expect(sockets).toEqual([
      { address: "127.0.0.1", port: 3010, process: "node", pid: 123 },
      { address: "0.0.0.0", port: 7000, process: null, pid: null },
    ]);
  });

  it("keeps project dev servers and drops system services", () => {
    const sockets = parseListeningSockets([
      'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=1,fd=4))',
      'LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=2,fd=3))',
      'LISTEN 0 4096 127.0.0.53:53 0.0.0.0:* users:(("systemd-resolve",pid=3,fd=5))',
      'LISTEN 0 10 127.0.0.1:34275 0.0.0.0:* users:(("chrome",pid=4,fd=76))',
      'LISTEN 0 16 127.0.0.1:18181 0.0.0.0:* users:(("codexbar",pid=5,fd=6))',
      'LISTEN 0 4096 0.0.0.0:54321 0.0.0.0:*',
    ].join("\n"));
    expect(sockets.filter((socket) => isProjectSocket(socket)).map((socket) => socket.port)).toEqual([5_173, 54_321]);
  });
});
