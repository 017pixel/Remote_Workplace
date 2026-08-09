// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { UsageTimelineResponse } from "@workbench/contracts";
import type { UsagePreferences } from "../../stores/usagePreferences";
import { QuotaTimeline } from "./QuotaTimeline";
import { defaultUsagePreferences } from "../../stores/usagePreferences";

function prefs(over: Partial<ReturnType<typeof defaultUsagePreferences>> = {}): UsagePreferences {
  const defaults = defaultUsagePreferences();
  return { ...defaults, ...over, resetAll: () => undefined, applyPreset: () => undefined, set: () => undefined };
}

afterEach(cleanup);

const now = new Date(2026, 6, 29, 12, 0, 0).getTime();

function timelineData(over: Partial<UsageTimelineResponse> = {}): UsageTimelineResponse {
  return {
    lanes: [
      {
        providerId: "codex",
        accountId: "codex-1",
        accountLabel: "Privat",
        email: "privat@example.com",
        plan: "plus",
        active: true,
        windows: [
          { id: "primary", label: "5-Stunden-Limit", usedPercent: 20, remainingPercent: 80, windowMinutes: 300, resetsAt: "2026-07-29T17:00:00Z" },
          { id: "secondary", label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" },
        ],
        resetCredits: [],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
      {
        providerId: "claude",
        accountId: "claude-1",
        accountLabel: "Alice",
        email: "alice@example.com",
        plan: "pro",
        active: false,
        windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 66, remainingPercent: 34, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }],
        resetCredits: [],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
      {
        providerId: "opencode",
        accountId: "opencode-1",
        accountLabel: "OpenCode Go",
        email: null,
        plan: null,
        active: false,
        windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 90, remainingPercent: 10, windowMinutes: 10_080, resetsAt: "2026-07-31T00:00:00Z" }],
        resetCredits: [],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
    ],
    fetchedAt: "2026-07-29T10:00:00Z",
    lastSuccessfulFetchAt: "2026-07-29T10:00:00Z",
    ...over,
  };
}

describe("QuotaTimeline", () => {
  it("zeigt alle drei Provider gleichzeitig in eigenen Lanes", () => {
    render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    expect(screen.getByText("Privat")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getAllByText("OpenCode Go").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
  });

  it("markiert den serverweit aktiven Account mit einem Aktiv-Badge", () => {
    render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    const badges = screen.getAllByText("Aktiv");
    expect(badges).toHaveLength(1);
  });

  it("zeigt den verbleibenden Prozentsatz als Fenster-Label (Remaining-Semantik)", () => {
    render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    // Wochenfenster von Privat: 40 % verbleibend, Reset 01.08.
    const windowLabels = screen.getAllByText(/40%/);
    expect(windowLabels.length).toBeGreaterThan(0);
    // Das Füll-Element trägt aria-valuenow = verbleibend (40), nicht verbraucht (60).
    const progress = screen.getAllByRole("progressbar");
    expect(progress.length).toBeGreaterThan(0);
    const privatFill = progress.find((element) => element.getAttribute("aria-label")?.includes("Privat")) ?? progress[0]!;
    expect(privatFill.getAttribute("aria-valuenow")).toBe("40");
  });

  it("kennzeichnet veraltete Daten mit Badge und Alter, wenn Datenstatus aktiviert ist", () => {
    render(
      <QuotaTimeline
        now={now}
        prefs={prefs({ showDataStatus: true })}
        data={timelineData({ lanes: [{ ...timelineData().lanes[0]!, status: "stale", error: { code: "STALE_DATA", message: "Diese Limits sind älter als 90 Minuten." } }] })}
      />,
    );
    expect(screen.getByText(/Veraltet/)).toBeTruthy();
    expect(screen.getByText(/vor \d+ Std/)).toBeTruthy();
  });

  it("zeigt einen lokalen Fehler an der betroffenen Lane statt eines globalen Screens", () => {
    render(
      <QuotaTimeline
        now={now}
        prefs={prefs()}
        data={timelineData({
          lanes: [
            ...timelineData().lanes.slice(0, 2),
            {
              ...timelineData().lanes[2]!,
              status: "unavailable",
              error: { code: "PROFILE_UNAVAILABLE", message: "Für dieses Profil sind keine Limitdaten verfügbar." },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Für dieses Profil sind keine Limitdaten verfügbar.")).toBeTruthy();
    // Die anderen Lanes bleiben sichtbar.
    expect(screen.getByText("Privat")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("zeigt ohne zählende Fenster einen leeren Zustand statt zu raten", () => {
    render(
      <QuotaTimeline
        now={now}
        prefs={prefs()}
        data={timelineData({
          lanes: [{
            providerId: "claude",
            accountId: "claude-1",
            accountLabel: "Alice",
            email: null,
            plan: null,
            active: false,
            windows: [],
            resetCredits: [],
            status: "unavailable",
            error: { code: "NO_USAGE_DATA", message: "Für diesen Account liegen keine Limitfenster vor." },
            updatedAt: null,
          }],
        })}
      />,
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("setzt für zukünftige projizierte Fenster keinen erfundenen Remaining-Wert", () => {
    render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    // Projektionen sind als solche beschriftet, ohne Prozentwert.
    const projections = screen.getAllByText(/\(Projektion\)/);
    expect(projections.length).toBeGreaterThan(0);
    for (const projection of projections) {
      expect(/%/.test(projection.textContent ?? "")).toBe(false);
    }
  });

  it("wechselt per Tastatur zwischen Wochen- und 5-Stunden-Ansicht", () => {
    render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    const sessionButton = screen.getByRole("button", { name: "5 Std." });
    expect(sessionButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(sessionButton);
    expect(screen.getByRole("button", { name: "5 Std." }).getAttribute("aria-pressed")).toBe("true");
    // Wochenansicht aktiviert wieder die Wochenfenster.
    fireEvent.click(screen.getByRole("button", { name: "Wochen" }));
    expect(screen.getByRole("button", { name: "5 Std." }).getAttribute("aria-pressed")).toBe("false");
  });

  it("navigiert zwischen Zeiträumen und springt zurück zu heute", () => {
    render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    const today = screen.getByRole("button", { name: "Heute" });
    expect((today as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Vorheriger Zeitraum" }));
    expect((screen.getByRole("button", { name: "Heute" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Heute" }));
    expect((screen.getByRole("button", { name: "Heute" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hält die Timeline in einem horizontal scrollbaren Container (Mobile)", () => {
    const { container } = render(<QuotaTimeline data={timelineData()} now={now} prefs={prefs()} />);
    const scroll = container.querySelector(".qt-scroll");
    expect(scroll).not.toBeNull();
    // Der Chart trägt eine feste Track-Breite als Inline-Variable; der
    // Scroll-Container gibt die Breite erst bei schmalen Viewports frei.
    const chart = container.querySelector(".qt-chart");
    expect(chart?.getAttribute("style")).toContain("--qt-track-width");
  });
});
