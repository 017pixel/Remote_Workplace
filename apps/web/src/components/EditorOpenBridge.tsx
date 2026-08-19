import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { editorOpenEventSchema, WRAPT_LIMITS } from "@wrapt/contracts";
import { useWorkspaceStore } from "../stores/workspace";
import { wraptQueries } from "../lib/queryOptions";
import { useWraptNotice } from "../stores/wraptNotice";

/**
 * „Open in Editor" aus T3 Code: Das Server-Shim `code` meldet einen Pfad über
 * `POST /api/v1/editor/open`; dieser WebSocket-Kanal leitet ihn an die
 * geöffnete Workbench weiter. Die Bridge öffnet den Zielordner im code-server:
 * im Workspace-Layout als Panel, auf der eigenständigen Werkzeugseite als
 * Sprung nach `/code-editor/?folder=…`.
 */
export function EditorOpenBridge() {
  const projects = useQuery(wraptQueries.projects());
  const openPanel = useWorkspaceStore((state) => state.openPanel);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/editor/ws`);
      socket.onopen = () => { retry = 0; };
      socket.onmessage = (event) => {
        let parsed;
        try {
          parsed = editorOpenEventSchema.safeParse(JSON.parse(String(event.data)));
        } catch {
          return;
        }
        if (!parsed.success) return;
        const { path } = parsed.data;
        // Projekt mit dem längsten Pfad-Präfix finden; Unterordner gehören
        // weiter zum Projekt, außerhalb aller Projekte gibt es kein Match.
        const list = projects.data?.projects ?? [];
        const project = list
          .filter((candidate) => candidate.availability === "available" && candidate.path !== projects.data?.projectsRoot)
          .map((candidate) => ({ candidate, depth: candidate.path.length }))
          .filter(({ candidate }) => path === candidate.path || path.startsWith(`${candidate.path}/`))
          .sort((a, b) => b.depth - a.depth)[0]?.candidate;
        // Eigenständige Werkzeugseite: gleiches Verhalten wie der T3-„Open"-
        // Button im ToolPanel — Sprung in die Code-Editor-Seite mit Ordner.
        const standalone = ["/t3-code", "/code-editor", "/previews", "/browser"]
          .some((prefix) => window.location.pathname === prefix || window.location.pathname.startsWith(`${prefix}/`));
        if (standalone || !project) {
          const params = new URLSearchParams({ folder: path });
          window.location.assign(`/code-editor/?${params.toString()}`);
          return;
        }
        if (openPanel({
          type: "code-server",
          projectId: project.id,
          codeServerFolder: path,
        }) === null) {
          useWraptNotice.getState().show(`Es können höchstens ${WRAPT_LIMITS.maxResidentTools} Werkzeuge gleichzeitig geöffnet sein. Schließe zuerst ein Panel.`);
        }
      };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++)); };
    };
    connect();
    return () => { closed = true; window.clearTimeout(timer); socket?.close(); };
  }, [openPanel, projects.data]);

  return null;
}