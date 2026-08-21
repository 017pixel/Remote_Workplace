// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalTreeCallbacks } from "./TerminalTree";
import { TerminalTree } from "./TerminalTree";
import type { TerminalWorkspaceV2 } from "@wrapt/contracts";

afterEach(cleanup);

function workspace(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [{
      id: "entry-1",
      runtimeId: "00000000-0000-4000-8000-000000000001",
      name: "Shell",
      parentFolderId: "default",
      sortOrder: 0,
      pinned: false,
      persistent: false,
      kind: "shell",
      projectId: null,
      initialCwd: "/home/tester/projects/shell",
    }, {
      id: "entry-2",
      runtimeId: "00000000-0000-4000-8000-000000000002",
      name: "Codex",
      parentFolderId: "default",
      sortOrder: 1,
      pinned: false,
      persistent: false,
      kind: "codex",
      projectId: null,
      initialCwd: "/home/tester/projects/codex",
    }],
    folders: [
      { id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false },
      { id: "child", parentFolderId: "default", name: "Unterordner", sortOrder: 0, collapsed: false },
    ],
    areaLayouts: {},
  };
}

function callbacks(): TerminalTreeCallbacks {
  return {
    onOpenEntry: vi.fn(),
    onOpenInSplit: vi.fn(),
    onTogglePin: vi.fn(),
    onTogglePersistent: vi.fn(),
    onDeleteEntry: vi.fn(),
    onRenameEntry: vi.fn(),
    onNewTerminal: vi.fn(),
    onNewFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onToggleCollapse: vi.fn(),
    onDeleteFolder: vi.fn(),
    onContextMenu: vi.fn(),
    onMoveEntry: vi.fn(),
    onMoveFolder: vi.fn(),
    onResync: vi.fn(),
    onRestart: vi.fn(),
    onHoverStart: vi.fn(),
    onHoverEnd: vi.fn(),
  };
}

describe("TerminalTree", () => {
  it("rendert Root- und Unterordner genau einmal statt den Root rekursiv zu wiederholen", () => {
    expect(() => render(
      <TerminalTree
        document={workspace()}
        folderId={null}
        depth={0}
        areaId="standalone"
        meta={{}}
        cwds={{}}
        sessions={[]}
        editing={null}
        editingValue=""
        onEditingValueChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        dropTarget={null}
        createRowHandlers={() => ({ onPointerDown: vi.fn() })}
        callbacks={callbacks()}
      />,
    )).not.toThrow();

    expect(screen.getAllByText("Terminal")).toHaveLength(1);
    expect(screen.getAllByText("Unterordner")).toHaveLength(1);
    expect(screen.getAllByText("Shell")).toHaveLength(1);
  });

  it("filtert Sitzungen und öffnet den passenden Ordner automatisch", () => {
    render(
      <TerminalTree
        document={workspace()}
        folderId={null}
        depth={0}
        areaId="standalone"
        meta={{}}
        cwds={{}}
        sessions={[]}
        editing={null}
        editingValue=""
        onEditingValueChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        dropTarget={null}
        filter="shell"
        createRowHandlers={() => ({ onPointerDown: vi.fn() })}
        callbacks={callbacks()}
      />,
    );

    expect(screen.getByText("Shell")).toBeTruthy();
    expect(screen.getByText("Terminal")).toBeTruthy();
    expect(screen.queryByText("Unterordner")).toBeNull();
  });

  it("zeigt den Eröffnungspfad bei allen Terminals auch ohne fokussierten Live-Renderer", () => {
    render(
      <TerminalTree
        document={workspace()}
        folderId={null}
        depth={0}
        areaId="standalone"
        meta={{}}
        cwds={{}}
        sessions={[]}
        editing={null}
        editingValue=""
        onEditingValueChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        dropTarget={null}
        createRowHandlers={() => ({ onPointerDown: vi.fn() })}
        callbacks={callbacks()}
      />,
    );

    expect(screen.getByText("/home/tester/projects/shell")).toBeTruthy();
    expect(screen.getByText("/home/tester/projects/codex")).toBeTruthy();
  });
});
