import { describe, expect, it } from "vitest";
import {
  EXTENSION_API_SEMVER,
  EXTENSION_API_VERSION,
  MANIFEST_VERSION,
  extensionApiCompatibilitySchema,
  extensionApiVersionSchema,
  isVersionCompatible,
  manifestVersionSchema,
  remoteWorkplaceCompatibilitySchema,
  remoteWorkplaceVersionSchema,
  semanticVersionRangeSchema,
  semanticVersionSchema,
} from "./versioning.js";

describe("getrennte Plattformversionen", () => {
  it("hält Manifest- und Extension-API-Version unabhängig", () => {
    expect(manifestVersionSchema.parse(MANIFEST_VERSION)).toBe(1);
    expect(extensionApiVersionSchema.parse(EXTENSION_API_VERSION)).toBe(1);
    expect(EXTENSION_API_SEMVER).toBe("1.0.0");
    expect(manifestVersionSchema.safeParse(2).success).toBe(false);
    expect(extensionApiVersionSchema.safeParse("1").success).toBe(false);
  });

  it.each(["0.44.0", "1.0.0", "1.2.3-beta.1", "1.2.3-beta.1+build.7"])(
    "akzeptiert die kanonische Version %s",
    (value) => {
      expect(semanticVersionSchema.parse(value)).toBe(value);
      expect(remoteWorkplaceVersionSchema.parse(value)).toBe(value);
    },
  );

  it.each(["", "v1.0.0", "=1.0.0", "1.0", "01.0.0", "latest"])(
    "lehnt die nicht-kanonische Version %s ab",
    (value) => {
      expect(semanticVersionSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["*", ">=0.50.0", "^1", "1.x", ">=1.2.7 <1.3.0", "1.2.7 || >=2.0.0"])(
    "akzeptiert den Version Range %s",
    (value) => {
      expect(semanticVersionRangeSchema.parse(value)).toBe(value);
      expect(remoteWorkplaceCompatibilitySchema.parse(value)).toBe(value);
      expect(extensionApiCompatibilitySchema.parse(value)).toBe(value);
    },
  );

  it.each(["", " ", " ^1", "^1 ", "latest", "=>1.0.0", "eins"])("lehnt den ungültigen Range %s ab", (value) => {
    expect(semanticVersionRangeSchema.safeParse(value).success).toBe(false);
  });

  it("prüft Compatibility ohne ungültige Eingaben zu akzeptieren", () => {
    expect(isVersionCompatible("0.52.0", ">=0.50.0")).toBe(true);
    expect(isVersionCompatible("2.0.0", "^1")).toBe(false);
    expect(isVersionCompatible("1.0.0-beta.1", "^1")).toBe(false);
    expect(isVersionCompatible("latest", "^1")).toBe(false);
    expect(isVersionCompatible("1.0.0", "latest")).toBe(false);
  });
});
