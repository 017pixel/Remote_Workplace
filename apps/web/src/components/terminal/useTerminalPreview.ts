import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { terminalTransport } from "./transport/TerminalTransport";
import type { ServerMessage } from "./terminal-types";

export type TerminalPreviewStatus = "loading" | "ready" | "exited" | "error";

function visibleLines(terminal: Terminal): string[] {
  const buffer = terminal.buffer.active;
  const start = Math.max(0, buffer.viewportY);
  return Array.from({ length: terminal.rows }, (_, index) => buffer.getLine(start + index)?.translateToString(true).trimEnd() ?? "");
}

export function useTerminalPreview(runtimeId: string) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<TerminalPreviewStatus>("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: '"JetBrains Mono", "SF Mono", Consolas, monospace',
      fontSize: 12,
      scrollback: 1_000,
    });
    terminal.open(mount);
    const update = () => setLines(visibleLines(terminal));
    const write = (data: string) => terminal.write(data, update);
    const receive = (message: ServerMessage) => {
      switch (message.type) {
        case "terminal.snapshot":
          terminal.resize(message.cols, message.rows);
          terminal.reset();
          setStatus(message.status === "exited" ? "exited" : "ready");
          write(message.serialized);
          break;
        case "terminal.deltas":
          for (const delta of message.deltas) write(delta.data);
          break;
        case "terminal.output":
          write(message.data);
          break;
        case "terminal.cleared":
          terminal.reset();
          update();
          break;
        case "terminal.exited":
          setStatus("exited");
          break;
        case "terminal.error":
          setStatus("error");
          break;
        default:
          break;
      }
    };
    const subscription = terminalTransport.subscribe(runtimeId);
    const unsubscribeMessage = subscription.onMessage(receive);
    const requestSnapshot = () => { subscription.send({ type: "terminal.subscribe", runtimeId }); };
    const unsubscribeStatus = subscription.onStatus((connected) => { if (connected) requestSnapshot(); });
    requestSnapshot();
    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      subscription.dispose();
      terminal.dispose();
    };
  }, [runtimeId]);

  return { lines, mountRef, status };
}
