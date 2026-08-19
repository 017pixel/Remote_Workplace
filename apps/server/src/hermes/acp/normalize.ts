import type { HermesServerMessage, HermesToolCall } from "@wrapt/contracts";
import { redactSensitive, truncateText } from "../redaction.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean).join("");
  const item = record(value);
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (item.type === "text") return text(item);
  if (typeof item.output === "string") return item.output;
  return "";
}

function isoNow(): string { return new Date().toISOString(); }

function toolKind(value: unknown): HermesToolCall["kind"] {
  switch (value) {
    case "execute": return "terminal";
    case "edit": return "edit";
    case "read": return "read";
    case "search": return "search";
    case "fetch": return "browser";
    default: return "other";
  }
}

function toolStatus(value: unknown): HermesToolCall["status"] {
  switch (value) {
    case "pending": return "pending";
    case "in_progress":
    case "running": return "running";
    case "completed":
    case "success": return "completed";
    case "failed":
    case "cancelled": return "failed";
    default: return "running";
  }
}

function toolCallFromUpdate(update: Record<string, unknown>): HermesToolCall {
  const rawInput = record(update.rawInput ?? update.raw_input);
  const content = update.content;
  const contentText = text(content);
  const terminalContent = Array.isArray(content)
    ? content.map(record).find((item) => item.type === "terminal") ?? {}
    : {};
  const command = typeof rawInput.command === "string" ? rawInput.command : typeof terminalContent.command === "string" ? terminalContent.command : null;
  const cwd = typeof rawInput.cwd === "string" ? rawInput.cwd : typeof terminalContent.cwd === "string" ? terminalContent.cwd : null;
  const exitCode = typeof terminalContent.exitCode === "number" ? terminalContent.exitCode : typeof terminalContent.exit_code === "number" ? terminalContent.exit_code : null;
  const explicitId = update.toolCallId ?? update.tool_call_id;
  const id = typeof explicitId === "string" && explicitId.length > 0
    ? explicitId
    : `tool-${String(update.title ?? update.name ?? update.kind ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"}`;
  const name = String(update.name ?? update.title ?? "Werkzeug");
  return {
    id,
    name: name.slice(0, 160),
    kind: toolKind(update.kind),
    status: toolStatus(update.status),
    title: String(update.title ?? name).slice(0, 240),
    arguments: Object.keys(rawInput).length > 0 ? redactSensitive(rawInput) as Record<string, unknown> : null,
    result: contentText ? truncateText(contentText, 8_192) : null,
    command: command ? command.slice(0, 8_192) : null,
    cwd: cwd ? cwd.slice(0, 2_048) : null,
    exitCode,
    startedAt: typeof update.startedAt === "string" ? update.startedAt : typeof update.started_at === "string" ? update.started_at : isoNow(),
    durationMs: typeof update.durationMs === "number" ? Math.max(0, Math.round(update.durationMs)) : null,
    truncated: contentText.length > 8_192,
  };
}

export type NormalizedAcpUpdate =
  | { kind: "message.delta"; messageId: string; delta: string }
  | { kind: "message.replay"; messageId: string; role: "user" | "assistant"; content: string }
  | { kind: "thought.delta"; delta: string }
  | { kind: "tool.update"; toolCall: HermesToolCall }
  | { kind: "commands.available"; commands: Array<{ name: string; description: string; inputHint: string | null }> }
  | { kind: "usage"; usage: { inputTokens: number; outputTokens: number; totalTokens: number; contextSize: number | null } }
  | { kind: "session.title"; title: string }
  | null;

export function normalizeAcpUpdate(updateValue: unknown): NormalizedAcpUpdate {
  const update = record(updateValue);
  const kind = update.sessionUpdate ?? update.session_update;
  if (kind === "user_message_chunk") {
    return { kind: "message.replay", messageId: String(update.messageId ?? update.message_id ?? "user"), role: "user", content: text(update.content) };
  }
  if (kind === "agent_message_chunk") {
    const replay = update.fieldMeta !== undefined || update.field_meta !== undefined;
    return replay
      ? { kind: "message.replay", messageId: String(update.messageId ?? update.message_id ?? "assistant"), role: "assistant", content: text(update.content) }
      : { kind: "message.delta", messageId: String(update.messageId ?? update.message_id ?? "assistant"), delta: text(update.content) };
  }
  if (kind === "agent_thought_chunk") return { kind: "thought.delta", delta: text(update.content) };
  if (kind === "tool_call" || kind === "tool_call_update") return { kind: "tool.update", toolCall: toolCallFromUpdate(update) };
  if (kind === "available_commands_update") {
    const rawCommands: unknown = update.availableCommands ?? update.available_commands;
    const commands: unknown[] = Array.isArray(rawCommands) ? rawCommands : [];
    return {
      kind: "commands.available",
      commands: commands.map((value) => {
        const item = record(value);
        const input = record(item.input);
        return { name: String(item.name ?? item.command ?? "").slice(0, 80), description: String(item.description ?? "").slice(0, 240), inputHint: typeof item.inputHint === "string" ? item.inputHint.slice(0, 160) : typeof input.hint === "string" ? input.hint.slice(0, 160) : null };
      }).filter((item) => item.name.length > 0),
    };
  }
  if (kind === "usage_update") {
    const usage = record(update);
    const size = typeof usage.size === "number" ? Math.max(0, Math.round(usage.size)) : 0;
    const used = typeof usage.used === "number" ? Math.max(0, Math.round(usage.used)) : 0;
    return { kind: "usage", usage: { inputTokens: 0, outputTokens: used, totalTokens: used, contextSize: size || null } };
  }
  if (kind === "session_info_update") {
    const title = typeof update.title === "string" ? update.title.trim() : "";
    return title ? { kind: "session.title", title: title.slice(0, 200) } : null;
  }
  return null;
}

export function normalizePermission(paramsValue: unknown, requestId: string, timeoutSeconds: number): HermesServerMessage {
  const params = record(paramsValue);
  const toolCall = record(params.toolCall ?? params.tool_call);
  const rawInput = record(toolCall.rawInput ?? toolCall.raw_input);
  const command = typeof rawInput.command === "string" ? rawInput.command : null;
  const options = Array.isArray(params.options) ? params.options.map((option) => String(record(option).optionId ?? record(option).option_id ?? "")).filter((option): option is "allow_once" | "allow_session" | "deny" => option === "allow_once" || option === "allow_session" || option === "deny") : [];
  const sessionId = String(params.sessionId ?? params.session_id ?? "");
  const expiresAt = new Date(Date.now() + timeoutSeconds * 1_000).toISOString();
  return {
    v: 1,
    type: "approval.requested",
    request: {
      requestId,
      sessionId,
      toolCallId: typeof toolCall.toolCallId === "string" ? toolCall.toolCallId : typeof toolCall.tool_call_id === "string" ? toolCall.tool_call_id : null,
      title: String(toolCall.title ?? "Freigabe erforderlich").slice(0, 240),
      description: text(toolCall.content).slice(0, 2_000),
      command: command?.slice(0, 8_192) ?? null,
      risk: command && /sudo|rm\s+-rf|drop\s+database|>/i.test(command) ? "high" : command ? "medium" : "low",
      options: options.length > 0 ? options : ["allow_once", "deny"],
      expiresAt,
    },
  };
}
