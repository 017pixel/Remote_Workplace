// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { t3ThreadIdFromPath } from "./t3Thread";

describe("t3ThreadIdFromPath", () => {
  it("liest Threads aus der Root-Thread-Route", () => {
    expect(t3ThreadIdFromPath("/environment-1/thread-9")).toBe("thread-9");
    expect(t3ThreadIdFromPath("/environment-1/thread-9?x=1")).toBe("thread-9");
  });

  it("liest ältere Pfade unter dem _chat-Layout", () => {
    expect(t3ThreadIdFromPath("/_chat/environment-1/thread-9")).toBe("thread-9");
    expect(t3ThreadIdFromPath("/_chat/environment-1/thread-9?x=1")).toBe("thread-9");
  });

  it("liefert null für Startseiten und Listen", () => {
    expect(t3ThreadIdFromPath("/")).toBeNull();
    expect(t3ThreadIdFromPath("/_chat")).toBeNull();
    expect(t3ThreadIdFromPath("/_chat/")).toBeNull();
    expect(t3ThreadIdFromPath("/_chat/environment-1")).toBeNull();
    expect(t3ThreadIdFromPath("/settings")).toBeNull();
  });
});
