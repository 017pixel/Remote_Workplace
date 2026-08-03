// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HermesAdminFrame } from "./HermesAdminFrame";
import { RouteActivityProvider } from "../../lib/routeActivity";

afterEach(() => cleanup());

describe("HermesAdminFrame", () => {
  it("hält das iframe auch in einer geparkten Route montiert", () => {
    render(
      <RouteActivityProvider active={false}>
        <HermesAdminFrame path="/chat" onPathChange={vi.fn()} />
      </RouteActivityProvider>,
    );

    expect(screen.getByTitle("Hermes Agent")).toBeInstanceOf(HTMLIFrameElement);
  });
});
