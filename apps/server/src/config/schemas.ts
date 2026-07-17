import { isAbsolute, normalize } from "node:path";
import { serviceModeSchema } from "@workbench/contracts";
import { z } from "zod";

const identifierSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const privatePublicUrlSchema = z.url().refine((value) => {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1";
}, "Eine Browser-URL darf nicht auf localhost zeigen.");

const previewConfigSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1),
  url: privatePublicUrlSchema,
  mode: serviceModeSchema.default("hybrid"),
});

export const projectsConfigSchema = z.object({
  projects: z.array(
    z.object({
      id: identifierSchema,
      name: z.string().min(1),
      description: z.string(),
      path: z.string().refine(isAbsolute, "Projektpfade müssen absolut sein.").transform(normalize),
      enabled: z.boolean(),
      sortOrder: z.number().int(),
      previews: z.array(previewConfigSchema).default([]),
    }),
  ),
});

const statusCheckSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("systemd"), unit: z.string().regex(/^[a-zA-Z0-9@_.-]+\.service$/) }),
  z.object({ type: z.literal("http"), url: z.url() }),
  z.object({ type: z.literal("tailscale") }),
  z.object({ type: z.literal("self") }),
  z.object({ type: z.literal("none"), reason: z.string().min(1) }),
]);

export const servicesConfigSchema = z.object({
  services: z.array(
    z.object({
      id: identifierSchema,
      name: z.string().min(1),
      mode: serviceModeSchema,
      publicUrl: privatePublicUrlSchema.nullable(),
      check: statusCheckSchema,
    }),
  ),
});

export const commandsConfigSchema = z.object({
  commands: z.array(
    z.object({
      id: identifierSchema,
      name: z.string().min(1),
      description: z.string(),
      command: z.string().min(1),
    }),
  ),
});

export type ProjectsConfig = z.infer<typeof projectsConfigSchema>;
export type ServicesConfig = z.infer<typeof servicesConfigSchema>;
export type ServiceConfig = ServicesConfig["services"][number];

