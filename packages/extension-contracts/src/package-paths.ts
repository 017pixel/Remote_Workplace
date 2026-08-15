import { z } from "zod";

export const EXTENSION_LOCAL_PATH_MAX_LENGTH = 512;

// Pfade in einem Extension-Paket sind absichtlich unabhängig vom Host-Dateisystem.
// Das enge POSIX-Format verhindert absolute Pfade, Traversal, URL-Sonderzeichen und Backslashes.
export const extensionPackagePathPattern =
  /^\.\/[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?(?:\/[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?)*$/;

const extensionPackagePathBaseSchema = z
  .string()
  .max(EXTENSION_LOCAL_PATH_MAX_LENGTH)
  .regex(
    extensionPackagePathPattern,
    "Ein lokaler Paketpfad im POSIX-Format mit führendem ./ wird erwartet.",
  );

export const extensionPackagePathSchema = extensionPackagePathBaseSchema.brand<"ExtensionPackagePath">();
export type ExtensionPackagePath = z.infer<typeof extensionPackagePathSchema>;

export const extensionEntrypointPathSchema = extensionPackagePathBaseSchema
  .regex(/\.(?:c|m)?js$/, "Ein Extension-Entrypoint muss auf .js, .mjs oder .cjs enden.")
  .brand<"ExtensionEntrypointPath">();

export const extensionIconPathSchema = extensionPackagePathBaseSchema
  .regex(
    /\.(?:png|webp|jpe?g)$/,
    "Manifest V1 erlaubt für Icons nur lokale PNG-, WebP- oder JPEG-Dateien.",
  )
  .brand<"ExtensionIconPath">();

export const extensionMarkdownPathSchema = extensionPackagePathBaseSchema
  .regex(/\.md$/, "README und Changelog müssen lokale Markdown-Dateien sein.")
  .brand<"ExtensionMarkdownPath">();

export const extensionJsonPathSchema = extensionPackagePathBaseSchema
  .regex(/\.json$/, "Ein lokales JSON-Dokument im Extension-Paket wird erwartet.")
  .brand<"ExtensionJsonPath">();

export type ExtensionJsonPath = z.infer<typeof extensionJsonPathSchema>;
