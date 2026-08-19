import { describe, expect, it } from "vitest";
import { GeometryLease } from "./GeometryLease.js";

describe("GeometryLease", () => {
  it("übernimmt die Geometrie nur für den Owner", () => {
    const lease = new GeometryLease(120, 40, "desktop");
    expect(lease.handleResize(52, 24, "mobile")).toBeNull();
    expect(lease.canonicalCols).toBe(120);
    expect(lease.canonicalRows).toBe(40);
    expect(lease.handleResize(100, 30, "desktop")).toEqual({ cols: 100, rows: 30 });
  });

  it("ignoriert unveränderte Resizes (kein Ping-Pong)", () => {
    const lease = new GeometryLease(120, 40, "desktop");
    expect(lease.handleResize(120, 40, "desktop")).toBeNull();
  });

  it("übernimmt den Owner nur bei echter Interaktion", () => {
    const lease = new GeometryLease(120, 40, "desktop");
    lease.recordViewport("mobile", 52, 24);
    expect(lease.takeControl(undefined, undefined, "mobile")).toEqual({ cols: 52, rows: 24 });
    expect(lease.owner).toBe("mobile");
    expect(lease.canonicalCols).toBe(52);
  });

  it("wendet bei takeControl die mitgegebenen Maße an", () => {
    const lease = new GeometryLease(120, 40, "desktop");
    expect(lease.takeControl(60, 30, "mobile")).toEqual({ cols: 60, rows: 30 });
  });

  it("übergibt beim Trennen des Owners an den nächsten Client", () => {
    const lease = new GeometryLease(120, 40, "desktop");
    lease.recordViewport("mobile", 52, 24);
    expect(lease.release("desktop")).toEqual({ cols: 52, rows: 24 });
    expect(lease.owner).toBe("mobile");
    expect(lease.release("mobile")).toBeNull();
    expect(lease.owner).toBeNull();
  });

  it("resized nicht, wenn der nächste Client dieselbe Geometrie hat", () => {
    const lease = new GeometryLease(52, 24, "desktop");
    lease.recordViewport("mobile", 52, 24);
    expect(lease.release("desktop")).toBeNull();
    expect(lease.owner).toBe("mobile");
  });
});
