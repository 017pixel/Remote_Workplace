// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevicePickerButton } from "./DevicePickerButton";

afterEach(cleanup);

describe("DevicePickerButton", () => {
  it("keeps the current preset accessible without a visible label", () => {
    render(<DevicePickerButton deviceId="responsive" onChange={() => undefined} iconOnly />);
    const trigger = screen.getByRole("button", { name: "Geräteansicht wählen, aktuell Responsive" });
    expect(trigger.querySelector("span")).toBeNull();
    expect(trigger.getAttribute("title")).toBe("Geräteansicht wählen: Responsive");
  });

  it("renders its menu in a portal and applies a selection", () => {
    const onChange = vi.fn();
    const { container } = render(<DevicePickerButton deviceId="responsive" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Geräteansicht wählen/ }));

    const menu = screen.getByRole("menu", { name: "Geräteauswahl" });
    expect(menu.parentElement).toBe(document.body);
    expect(container.querySelector(".panel-device-menu")).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "iPhone 13" }));
    expect(onChange).toHaveBeenCalledWith("iphone-13");
    expect(screen.queryByRole("menu", { name: "Geräteauswahl" })).toBeNull();
  });
});
