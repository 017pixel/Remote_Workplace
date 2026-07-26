import { z } from "zod";
import { terminalKindSchema, type TerminalKind } from "@workbench/contracts";

const sessionId = z.string().uuid();
const runtimeId = z.string().uuid();
const dimensions = z.object({ cols: z.number().int().min(2).max(500), rows: z.number().int().min(1).max(300) });
export type { TerminalKind };

export const clientTerminalMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("terminal.create"),
    requestId: z.string().min(1).max(128),
    runtimeId: runtimeId.optional(),
    kind: terminalKindSchema.default("shell"),
    projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    cwd: z.string().min(1).max(1024).optional(),
    mode: z.enum(["agent", "login"]).default("agent"),
    accountId: z.string().uuid().optional(),
    ...dimensions.shape,
  }),
  z.object({ type: z.literal("terminal.attach"), sessionId }),
  z.object({ type: z.literal("terminal.input"), sessionId, data: z.string().min(1).max(65_536) }),
  z.object({ type: z.literal("terminal.resize"), sessionId, ...dimensions.shape }),
  z.object({ type: z.literal("terminal.clear"), sessionId }),
  z.object({ type: z.literal("terminal.restart"), sessionId }),
  z.object({ type: z.literal("terminal.close"), sessionId }),
  z.object({ type: z.literal("terminal.ping") }),
]);

export type ClientTerminalMessage = z.infer<typeof clientTerminalMessageSchema>;
export type TerminalErrorCode =
  | "UNAUTHORIZED" | "FORBIDDEN" | "SESSION_NOT_FOUND" | "SESSION_NOT_OWNED" | "INVALID_CWD"
  | "CWD_NOT_FOUND" | "CWD_NOT_DIRECTORY" | "PTY_SPAWN_FAILED" | "PTY_WRITE_FAILED"
  | "PTY_RESIZE_FAILED" | "TERMINAL_NOT_RUNNING" | "SESSION_INTERRUPTED" | "SESSION_ALREADY_CLOSED"
  | "SESSION_RUNTIME_CONFLICT" | "TOO_MANY_SESSIONS" | "INVALID_MESSAGE" | "INTERNAL_ERROR";

export type ServerTerminalMessage =
  | { type: "terminal.created"; requestId: string; sessionId: string; runtimeId: string; kind: TerminalKind; projectId: string | null; status: string; cwd: string; pid: number }
  | { type: "terminal.snapshot"; sessionId: string; runtimeId: string; kind: TerminalKind; status: string; projectId: string | null; cwd: string; history: string; sequence: number }
  | { type: "terminal.output"; sessionId: string; data: string; sequence: number }
  | { type: "terminal.exited"; sessionId: string; exitCode: number | null; signal: number | null; sequence: number }
  | { type: "terminal.restarting"; sessionId: string; reason: string; sequence: number }
  | { type: "terminal.cleared"; sessionId: string; sequence: number }
  | { type: "terminal.error"; sessionId?: string; code: TerminalErrorCode; message: string }
  | { type: "terminal.pong" };
