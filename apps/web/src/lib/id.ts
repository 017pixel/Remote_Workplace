function toHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

/**
 * RFC4122 version 4 UUID generator that works in every browser context,
 * including insecure origins (plain HTTP over a Tailscale IP) where the
 * native `crypto.randomUUID` is unavailable.
 */
export function generateId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    try {
      return cryptoObj.randomUUID();
    } catch {
      // `crypto.randomUUID` wirft in unsicheren Kontexten (HTTP) "The operation is insecure".
    }
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = toHex(bytes);
    return (
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
      `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    );
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
