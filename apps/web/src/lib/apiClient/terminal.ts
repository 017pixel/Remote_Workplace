import {
  terminalSessionsResponseSchema,
  terminalWorkspaceResponseSchema,
  type SaveTerminalWorkspaceRequest,
  type TerminalWorkspaceOpsRequest,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const terminalApi = {
  terminalSessions: (signal?: AbortSignal) => request("/terminal/sessions", terminalSessionsResponseSchema, signal),
  terminalWorkspace: (signal?: AbortSignal) => request("/terminal/workspace", terminalWorkspaceResponseSchema, signal),
  saveTerminalWorkspace: (body: SaveTerminalWorkspaceRequest) => mutate("/terminal/workspace", "PUT", terminalWorkspaceResponseSchema, body),
  terminalWorkspaceOps: (body: TerminalWorkspaceOpsRequest) => mutate("/terminal/workspace/ops", "POST", terminalWorkspaceResponseSchema, body),
  restartTerminalSession: (id: string) => mutate(`/terminal/sessions/${encodeURIComponent(id)}/restart`, "POST", null),
  closeTerminalSession: (id: string) => mutate(`/terminal/sessions/${encodeURIComponent(id)}`, "DELETE", null),
};
