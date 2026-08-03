import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher, type RequestInit } from "undici";

const MAX_REDIRECTS = 5;

const blockedIpv4Addresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) blockedIpv4Addresses.addSubnet(network, prefix, "ipv4");
const blockedIpv6Addresses = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  // IPv4-kompatible/-gemappte und NAT64-Adressen werden vollständig gesperrt:
  // andernfalls könnte die eingebettete IPv4-Adresse eine private Ressource sein.
  ["::", 96],
  ["::ffff:0.0.0.0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) blockedIpv6Addresses.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blockedIpv4Addresses.check(address, "ipv4");
  if (version === 6) return !blockedIpv6Addresses.check(address.split("%", 1)[0] ?? address, "ipv6");
  return false;
}

export function assertPublicHttpUrl(value: string | URL): URL {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Nur öffentliche HTTP(S)-Ziele sind erlaubt.");
  if (url.username || url.password) throw new Error("URLs mit Zugangsdaten sind nicht erlaubt.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Lokale Ziele sind nicht erlaubt.");
  }
  if (isIP(hostname) && !isPublicAddress(hostname)) throw new Error("Private oder reservierte Ziele sind nicht erlaubt.");
  return url;
}

type PublicLookupAddress = { address: string; family: number };
type PublicLookupResolver = (
  hostname: string,
  options: { all: true; verbatim: true },
  callback: (error: Error | null, addresses: PublicLookupAddress[]) => void,
) => void;
type PublicLookupOptions = Parameters<LookupFunction>[1];
type PublicLookupCallback = Parameters<LookupFunction>[2];
export function createPublicLookup(resolve: PublicLookupResolver = dnsLookup): LookupFunction {
  return (hostname: string, options: PublicLookupOptions, callback: PublicLookupCallback) => {
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      const fail = (reason: Error) => {
        if (options.all) callback(reason, []);
        else callback(reason, "", 0);
      };
      if (error) {
        fail(error);
        return;
      }
      if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
        fail(new Error("DNS-Ziel verweist auf eine private oder reservierte Adresse."));
        return;
      }
      const selected = addresses[0]!;
      if (options.all) {
        callback(null, [selected]);
        return;
      }
      callback(null, selected.address, selected.family);
    });
  };
}

const publicDispatcher = new Agent({
  connect: { lookup: createPublicLookup() },
});

export interface PublicFetchOptions extends Omit<RequestInit, "redirect" | "dispatcher"> {
  allowedOrigins?: ReadonlySet<string>;
  maxRedirects?: number;
}

/**
 * Führt öffentliche HTTP-Aufrufe mit gepinnter, geprüfter DNS-Auflösung aus.
 * Redirects werden einzeln validiert; dadurch können weder DNS-Rebinding noch
 * Redirects auf Loopback-, Link-Local- oder private Netze die URL-Prüfung umgehen.
 */
export async function fetchPublic(value: string | URL, options: PublicFetchOptions = {}) {
  const { allowedOrigins, maxRedirects = MAX_REDIRECTS, ...requestOptions } = options;
  let target = assertPublicHttpUrl(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (allowedOrigins && !allowedOrigins.has(target.origin)) throw new Error("Die Ziel-Origin ist nicht freigegeben.");
    const response = await undiciFetch(target, {
      ...requestOptions,
      redirect: "manual",
      dispatcher: publicDispatcher as Dispatcher,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return response;
    if (redirect === maxRedirects) throw new Error("Zu viele HTTP-Weiterleitungen.");
    target = assertPublicHttpUrl(new URL(location, target));
  }
  throw new Error("Zu viele HTTP-Weiterleitungen.");
}

interface StreamedHttpResponse {
  headers: { get(name: string): string | null };
  body: (AsyncIterable<Uint8Array> & { cancel(): Promise<void> }) | null;
}

export async function readBodyLimited(
  response: StreamedHttpResponse,
  maximumBytes: number,
): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new Error("Antwort überschreitet das Größenlimit.");
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maximumBytes) {
      await response.body.cancel();
      throw new Error("Antwort überschreitet das Größenlimit.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes);
}
