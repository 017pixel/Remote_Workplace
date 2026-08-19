// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalPort, LocalPortsResponse } from "@wrapt/contracts";
import { LocalPorts } from "./LocalPorts";

const port = (number: number, projectId: string | null): LocalPort => ({
  port: number,
  address: "127.0.0.1",
  process: "vite",
  pid: number,
  projectId,
  projectName: projectId,
  protocol: "http",
  localUrl: `http://127.0.0.1:${number}/`,
  proxyUrl: null,
});

function renderPorts(projectId?: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<LocalPortsResponse>(["local-ports"], {
    ports: [port(3001, "eins"), port(3002, "zwei"), port(3003, null)],
    scannedAt: new Date().toISOString(),
  });
  return render(
    <QueryClientProvider client={client}>
      <LocalPorts
        onOpen={() => undefined}
        {...(projectId !== undefined ? { projectId, projectName: "Projekt Eins", allowAllPorts: true } : {})}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("LocalPorts", () => {
  it("filters by project and temporarily reveals every port", () => {
    renderPorts("eins");
    expect(screen.getByText("localhost:3001")).toBeTruthy();
    expect(screen.queryByText("localhost:3002")).toBeNull();
    expect(screen.queryByText("localhost:3003")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Alle Ports" }));
    expect(screen.getByText("localhost:3002")).toBeTruthy();
    expect(screen.getByText("localhost:3003")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Nur dieses Projekt" }));
    expect(screen.queryByText("localhost:3002")).toBeNull();
  });

  it("shows every port when no preview project is supplied", () => {
    renderPorts();
    expect(screen.getByText("localhost:3001")).toBeTruthy();
    expect(screen.getByText("localhost:3002")).toBeTruthy();
    expect(screen.getByText("localhost:3003")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alle Ports" })).toBeNull();
  });
});
