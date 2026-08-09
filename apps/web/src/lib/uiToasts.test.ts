import { describe, expect, it, vi } from "vitest";
import { showUiToast, subscribeUiToasts } from "./uiToasts";

describe("UI-Toast-Bus", () => {
  it("liefert ein Toast mit eindeutiger ID und Standard-Severity", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUiToasts(listener);
    showUiToast({ title: "Kopiert" });
    unsubscribe();
    expect(listener).toHaveBeenCalledOnce();
    const toast = listener.mock.calls[0]![0];
    expect(toast.title).toBe("Kopiert");
    expect(toast.severity).toBe("info");
    expect(toast.id).toBeTypeOf("string");
    expect(toast.id.length).toBeGreaterThan(0);
  });

  it("reicht Titel, Body und Severity unverändert weiter", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUiToasts(listener);
    showUiToast({ title: "Warnung", body: "Nicht erlaubt", severity: "warn" });
    unsubscribe();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ title: "Warnung", body: "Nicht erlaubt", severity: "warn" }));
  });

  it("liefert nach dem Abbestellen keine Toasts mehr", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUiToasts(listener);
    unsubscribe();
    showUiToast({ title: "Kopiert" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("benachrichtigt mehrere Listener gleichzeitig", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeUiToasts(first);
    const unsubscribeSecond = subscribeUiToasts(second);
    showUiToast({ title: "Kopiert" });
    unsubscribeFirst();
    unsubscribeSecond();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
