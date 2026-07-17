import { execa } from "execa";
import { z } from "zod";

const tailscaleStatusSchema = z.object({
  BackendState: z.string().optional(),
  Self: z
    .object({
      HostName: z.string().optional(),
      DNSName: z.string().optional(),
      Online: z.boolean().optional(),
    })
    .optional(),
});

export interface TailscaleStatus {
  state: "connected" | "disconnected" | "unknown";
  hostname: string | null;
  dnsName: string | null;
}

export async function readTailscaleStatus(): Promise<TailscaleStatus> {
  const result = await execa("tailscale", ["status", "--json"], {
    reject: false,
    shell: false,
    timeout: 3_000,
  });
  if (result.exitCode !== 0) return { state: "unknown", hostname: null, dnsName: null };

  try {
    const status = tailscaleStatusSchema.parse(JSON.parse(result.stdout) as unknown);
    const connected = status.BackendState === "Running" && status.Self?.Online !== false;
    return {
      state: connected ? "connected" : "disconnected",
      hostname: status.Self?.HostName ?? null,
      dnsName: status.Self?.DNSName?.replace(/\.$/, "") ?? null,
    };
  } catch {
    return { state: "unknown", hostname: null, dnsName: null };
  }
}

