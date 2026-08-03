import { describe, expect, it } from "vitest";
import { shouldNotifyHermesMessage, shouldNotifyHermesSession } from "./result-sync.js";

describe("Hermes-Benachrichtigungsfilter", () => {
  it("unterdrückt kurze Web- und ACP-Antworten ohne Werkzeuge", () => {
    expect(shouldNotifyHermesSession("web", 45, 120)).toBe(false);
    expect(shouldNotifyHermesSession("acp", 119, 120)).toBe(false);
    expect(shouldNotifyHermesMessage(45, 0, 120)).toBe(false);
  });

  it("meldet Cron, lange Sitzungen und Werkzeugläufe", () => {
    expect(shouldNotifyHermesSession("cron", 2, 120)).toBe(true);
    expect(shouldNotifyHermesSession("web", 120, 120)).toBe(true);
    expect(shouldNotifyHermesMessage(10, 1, 120)).toBe(true);
  });
});
