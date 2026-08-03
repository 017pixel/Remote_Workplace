export interface AcpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface AcpJsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface AcpJsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export type AcpIncomingMessage = AcpJsonRpcResponse | AcpJsonRpcRequest | AcpJsonRpcNotification;

export function encodeAcpMessage(message: AcpJsonRpcRequest | AcpJsonRpcNotification | AcpJsonRpcResponse): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseAcpMessage(line: string): AcpIncomingMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.jsonrpc !== "2.0") return null;
    return parsed as AcpIncomingMessage;
  } catch {
    return null;
  }
}
