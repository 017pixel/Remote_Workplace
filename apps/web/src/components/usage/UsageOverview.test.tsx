// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UsageTimelineResponse } from "@workbench/contracts";
import { UsageOverview } from "./UsageOverview";
import { useUsagePreferences, defaultUsagePreferences } from "../../stores/usagePreferences";

afterEach(() => {
  cleanup();
  useUsagePreferences.setState(defaultUsagePreferences());
});

beforeEach(() => {
  useUsagePreferences.setState(defaultUsagePreferences());
});

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
          { id: "primary", label: "5-Stunden-Limit", usedPercent: 18, remainingPercent: 82, windowMinutes: 300, resetsAt: "2026-07-29T17:00:00Z" },
          { id: "secondary", label: "Wochenlimit", usedPercent: 74, remainingPercent: 26, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" },
        ],
        resetCredits: [],
        status: "available",
        error: null,
        updatedAt: "2026-07-29T10:00:00Z",
      },
      {
        providerId: "codex",
        accountId: "codex-2",
        accountLabel: "Arbeit",
        email: "arbeit@example.com",
        plan: "team",
        active: false,
        windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 96, remainingPercent: 4, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }],
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
        windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 28, remainingPercent: 72, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }],
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
        windows: [],
        resetCredits: [],
        status: "unavailable",
        error: { code: "NO_USAGE_DATA", message: "Für diesen Account liegen keine Limitfenster vor." },
        updatedAt: null,
      },
    ],
    fetchedAt: "2026-07-29T10:00:00Z",
    lastSuccessfulFetchAt: "2026-07-29T10:00:00Z",
    ...over,
  };
}

describe("UsageOverview", () => {
  it("zeigt die Statuszeile mit Accounts, niedrigen und nächstem Reset", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const summary = screen.getByLabelText("Zusammenfassung der Limits");
    expect(within(summary).getByText("4")).toBeTruthy();
    // Bei 20 % Schwelle ist nur Arbeit (4 %) niedrig; OpenCode hat keine Daten.
    expect(within(summary).getByText("1")).toBeTruthy();
    expect(within(summary).getByText(/nächster Reset/)).toBeTruthy();
  });

  it("zeigt die kompakte Account-Liste mit allen Limits (Limits jetzt)", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).getByText("Privat")).toBeTruthy();
    expect(within(table).getByText("Arbeit")).toBeTruthy();
    expect(within(table).getByText("Alice")).toBeTruthy();
    expect(within(table).getByText("82 %")).toBeTruthy();
    expect(within(table).getByText("26 %")).toBeTruthy();
  });

  it("markiert den aktiven Account in der Liste", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.getAllByText("Aktiv").length).toBeGreaterThan(0);
  });

  it("zeigt die Statuszeile statt der KPI-Karten standardmäßig (Standardansicht)", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.queryByText("Tokens heute")).toBeNull();
  });

  it("blendet die Timeline aus, wenn das Preset es nicht zeigt (Kompakt)", () => {
    useUsagePreferences.getState().applyPreset("compact");
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.queryByRole("heading", { name: "Quota-Timeline" })).toBeNull();
    // Die Account-Liste bleibt sichtbar.
    expect(screen.getByRole("table", { name: "Aktuelle Limits je Account" })).toBeTruthy();
  });

  it("zeigt die Timeline im Standard-Preset", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.getByRole("heading", { name: "Quota-Timeline" })).toBeTruthy();
  });

  it("zeigt nur die Timeline bei limitsView=timeline", () => {
    useUsagePreferences.getState().set({ limitsView: "timeline" });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.queryByRole("table", { name: "Aktuelle Limits je Account" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Quota-Timeline" })).toBeTruthy();
  });

  it("filtert nach Provider über die Filterleiste", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const select = screen.getByLabelText(/Provider/);
    fireEvent.change(select, { target: { value: "claude" } });
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).getByText("Alice")).toBeTruthy();
    expect(within(table).queryByText("Privat")).toBeNull();
    expect(within(table).queryByText("Arbeit")).toBeNull();
  });

  it("filtert nach aktivem Account", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByLabelText(/Nur aktiv/));
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).getByText("Privat")).toBeTruthy();
    expect(within(table).queryByText("Arbeit")).toBeNull();
    expect(within(table).queryByText("Alice")).toBeNull();
  });

  it("zeigt bei leeren Filtern eine verständliche Meldung mit Filter-Reset", () => {
    const store = useUsagePreferences.getState();
    store.set({ hiddenAccountIds: ["codex-1", "codex-2", "claude-1", "opencode-1"] });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    expect(screen.getByText(/Keine Accounts entsprechen den gewählten Filtern/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(screen.getByRole("table", { name: "Aktuelle Limits je Account" })).toBeTruthy();
  });

  it("blendet Accounts ohne Daten aus, wenn aktiviert", () => {
    useUsagePreferences.getState().set({ hideAccountsWithoutData: true });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const table = screen.getByRole("table", { name: "Aktuelle Limits je Account" });
    expect(within(table).queryByText("OpenCode Go")).toBeNull();
    expect(within(table).getByText("Alice")).toBeTruthy();
  });

  it("zeigt bei Warnschwelle 30 mehr niedrige Accounts als bei 20", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const summaryDefault = screen.getByLabelText("Zusammenfassung der Limits");
    // Bei 20 %: nur Arbeit (4 %).
    expect(within(summaryDefault).getByText("1")).toBeTruthy();
    cleanup();
    useUsagePreferences.getState().set({ warningThreshold: 30 });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const summary30 = screen.getByLabelText("Zusammenfassung der Limits");
    // Bei 30 %: Arbeit (4 %) und Privat (26 %) sind niedrig.
    expect(within(summary30).getByText("2")).toBeTruthy();
  });

  it("klappt Details einer Account-Row auf (Fenster; E-Mail nur bei aktivierter Option)", () => {
    render(<UsageOverview timeline={timelineData()} now={now} />);
    const row = screen.getByRole("button", { name: "Arbeit Details" });
    fireEvent.click(row);
    // E-Mail ist standardmäßig ausgeblendet.
    expect(screen.queryByText("arbeit@example.com")).toBeNull();
    // Die Details sind aufgeklappt und zeigen die Fenster-Zeile.
    const details = document.querySelector(".uat-details");
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("4 % verbleibend");
    expect(details?.textContent).toContain("96 % verbraucht");
  });

  it("zeigt die E-Mail in den Details, wenn aktiviert", () => {
    useUsagePreferences.getState().set({ showEmail: true });
    render(<UsageOverview timeline={timelineData()} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Arbeit Details" }));
    expect(screen.getByText("arbeit@example.com")).toBeTruthy();
  });
});
