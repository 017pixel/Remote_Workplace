import { describe, expect, it } from "vitest";
import { normalizeAcpUpdate, normalizePermission } from "./normalize.js";

describe("ACP-Normalisierung", () => {
  it("normalisiert Streaming, Toolkarten und verschachtelte Befehls-Hinweise", () => {
    expect(normalizeAcpUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hallo" } })).toEqual({ kind: "message.delta", messageId: "assistant", delta: "Hallo" });
    expect(normalizeAcpUpdate({ sessionUpdate: "available_commands_update", availableCommands: [{ name: "model", description: "Modell", input: { hint: "Name" } }] })).toMatchObject({ kind: "commands.available", commands: [{ name: "model", inputHint: "Name" }] });
    expect(normalizeAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "tool-1", name: "execute", kind: "execute", status: "completed", rawInput: { command: "echo ok" }, content: [{ type: "terminal", command: "echo ok", exitCode: 0 }] })).toMatchObject({ kind: "tool.update", toolCall: { id: "tool-1", kind: "terminal", command: "echo ok", exitCode: 0, status: "completed" } });
  });

  it("bildet ACP-Freigaben ohne dauerhafte Erlaubnis ab", () => {
    const message = normalizePermission({ sessionId: "session-1", toolCall: { toolCallId: "tool-1", title: "Befehl", rawInput: { command: "sudo reboot" }, content: "Risiko" }, options: [{ optionId: "allow_once" }, { optionId: "allow_session" }] }, "request-1", 60);
    expect(message).toMatchObject({ type: "approval.requested", request: { requestId: "request-1", sessionId: "session-1", risk: "high", options: ["allow_once", "allow_session"] } });
  });
});
