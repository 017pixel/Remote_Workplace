// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, DataTable, Switch, Tabs } from ".";

afterEach(cleanup);

describe("COSS UI-Primitives", () => {
  it("führt Button-Aktionen aus und behält den zugänglichen Namen", () => {
    const action = vi.fn();
    render(<Button onClick={action}>Speichern</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("meldet Änderungen eines Switches", () => {
    const changed = vi.fn();
    render(<Switch label="Diagnose" description="Fehlerzustände erfassen" checked={false} onCheckedChange={changed} />);
    fireEvent.click(screen.getByRole("switch", { name: "Diagnose" }));
    expect(changed).toHaveBeenCalledWith(true);
    expect(screen.getByText("Fehlerzustände erfassen")).toBeTruthy();
  });

  it("wechselt Tabs und zeigt nur das aktive Panel", () => {
    render(<Tabs label="Bereiche" defaultValue="eins" tabs={[
      { value: "eins", label: "Eins", content: <p>Erster Inhalt</p> },
      { value: "zwei", label: "Zwei", content: <p>Zweiter Inhalt</p> },
    ]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Zwei" }));
    expect(screen.getByRole("tab", { name: "Zwei" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Zweiter Inhalt");
  });

  it("liefert dieselben Daten für Desktop-Tabelle und mobile Karten", () => {
    render(<DataTable
      rows={[{ id: "eins", name: "Alpha", status: "Bereit" }]}
      getRowKey={(row) => row.id}
      caption="Projekte"
      columns={[
        { id: "name", header: "Name", priority: "primary", cell: (row) => row.name },
        { id: "status", header: "Status", priority: "secondary", cell: (row) => row.status },
      ]}
    />);
    expect(screen.getByRole("table", { name: "Projekte" })).toBeTruthy();
    expect(screen.getAllByText("Alpha")).toHaveLength(2);
    expect(screen.getAllByText("Bereit")).toHaveLength(2);
  });
});
