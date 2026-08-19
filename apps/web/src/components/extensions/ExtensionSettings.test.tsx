// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionSettings } from "./ExtensionSettings";
import type { CatalogEntry, ExtensionRegistrySummary } from "@wrapt/extension-contracts";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  registry: vi.fn(),
  detail: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("../../lib/apiClient", () => {
  class ApiClientError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    ApiClientError,
    apiClient: {
      extensionCatalog: mocks.catalog,
      extensionRegistry: mocks.registry,
      extensionDetail: mocks.detail,
      dispatchExtensionOperation: mocks.dispatch,
    },
  };
});

const catalogEntry = {
  providerId: "wrapt-catalog",
  effectiveTrust: "catalog-first-party",
  manifest: {
    manifestVersion: 1,
    id: "wrapt.demo-clock",
    name: "Demo Uhr",
    version: "1.0.0",
    publisher: "workbench",
    description: "Beispiel-Extension.",
    license: "MIT",
    engines: { wrapt: ">=0.95.0", extensionApi: ">=1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { ui: "./index.js" },
    permissions: [{ permission: "notifications.create" }],
    activationEvents: [],
    contributes: { commands: [{ id: "wrapt.demo-clock.tick", title: "Uhr schlagen" }] },
  },
  package: {
    formatVersion: 1,
    extensionId: "wrapt.demo-clock",
    version: "1.0.0",
    manifestPath: "./extension.json",
    archiveBytes: 12,
    unpackedBytes: 12,
    integrity: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    files: [{ path: "./extension.json", bytes: 12, integrity: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" }],
  },
} as unknown as CatalogEntry;

const catalogResponse = {
  providerId: "wrapt-catalog",
  revision: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  entries: [catalogEntry],
};

function installedSummary(overrides: Partial<ExtensionRegistrySummary> = {}): ExtensionRegistrySummary {
  return {
    id: "wrapt.demo-clock",
    name: "Demo Uhr",
    description: "Beispiel-Extension.",
    publisher: "workbench",
    source: { kind: "catalog", providerId: "wrapt-catalog", packageIntegrity: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
    effectiveTrust: "catalog-first-party",
    lifecycle: "active",
    desiredEnablement: "enabled",
    runtimeActive: true,
    required: false,
    installedVersion: "1.0.0",
    activeVersion: "1.0.0",
    allowedOperations: [],
    ...overrides,
  } as unknown as ExtensionRegistrySummary;
}

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExtensionSettings />
    </QueryClientProvider>,
  );
}

describe("ExtensionSettings", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue(catalogResponse);
    mocks.registry.mockResolvedValue({ revision: 0, generatedAt: new Date().toISOString(), extensions: [] });
    mocks.dispatch.mockResolvedValue({
      revision: 1,
      operation: { id: "00000000-0000-4000-8000-000000000000", type: "install", status: "succeeded", requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
      extension: installedSummary({ lifecycle: "permissions-pending", permissionReview: { reviewId: "00000000-0000-4000-8000-000000000000", reason: "install", requestedPermissions: [{ permission: "notifications.create" }], addedPermissions: [{ permission: "notifications.create" }], createdAt: new Date().toISOString() } }),
    });
  });

  it("zeigt den Catalog und installiert über die Management-API", async () => {
    renderWithClient();
    expect(await screen.findByText("Demo Uhr")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Installieren/ }));

    await waitFor(() => {
      expect(mocks.dispatch).toHaveBeenCalledWith({
        operation: "install",
        extensionId: "wrapt.demo-clock",
        expectedRevision: 0,
        source: {
          kind: "catalog",
          providerId: "wrapt-catalog",
          catalogRevision: catalogResponse.revision,
          version: "1.0.0",
          packageIntegrity: catalogEntry.package.integrity,
        },
        enableAfterInstall: true,
      });
    });
  });

  it("legt einen offenen Permission Review sofort vor und schließt ihn per Freigabe", async () => {
    renderWithClient();
    await screen.findByText("Demo Uhr");
    fireEvent.click(screen.getByRole("button", { name: /Installieren/ }));

    const dialog = await screen.findByRole("dialog", { name: /Berechtigungen für Demo Uhr/ });
    expect(dialog.textContent).toContain("Benachrichtigungen senden");
    fireEvent.click(screen.getByRole("button", { name: "Alle freigeben" }));

    await waitFor(() => {
      expect(mocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "review-permissions",
          reviewId: "00000000-0000-4000-8000-000000000000",
          resolution: { decision: "approve", grants: [{ permission: "notifications.create" }] },
        }),
      );
    });
  });

  it("deinstalliert eine aktive Extension erst nach Bestätigung", async () => {
    mocks.registry.mockResolvedValue({
      revision: 1,
      generatedAt: new Date().toISOString(),
      extensions: [installedSummary()],
    });
    renderWithClient();
    const installedTab = screen.getAllByRole("button").find((button) => button.textContent?.includes("Installiert"));
    expect(installedTab).toBeTruthy();
    fireEvent.click(installedTab!);

    const row = await screen.findByText("Demo Uhr");
    expect(row).toBeTruthy();
    expect(await screen.findByText("Aktiv")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Deinstallieren/ }));
    await screen.findByRole("dialog", { name: /deinstallieren/ });
    fireEvent.click(screen.getByRole("button", { name: "Deinstallieren" }));

    await waitFor(() => {
      expect(mocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "uninstall", data: "delete", expectedRevision: 1 }),
      );
    });
  });
});
