import { describe, expect, it } from "vitest";
import {
  FILE_CONTRIBUTIONS_MAX_COUNT,
  FILE_MATCH_VALUES_MAX_COUNT,
  FILE_PRIORITY_MAX,
  fileContributionSchema,
  fileContributionsSchema,
  fileExtensionSchema,
  fileMatcherSchema,
  fileMimeTypeSchema,
  fileNameSchema,
} from "./file-contributions.js";

const viewer = {
  id: "workbench.markdown.file.viewer",
  kind: "viewer",
  title: "Markdown Vorschau",
  icon: "workbench.markdown.icon.file",
  matcher: {
    extensions: ["md", "markdown"],
    fileNames: ["README"],
    mimeTypes: ["text/markdown"],
    caseSensitiveFileNames: false,
  },
  priority: 80,
  provider: "workbench.markdown.file-provider.viewer",
  surfaces: ["detail", "quick-look"],
  contentMode: "text",
} as const;

describe("File Matcher V1", () => {
  it.each(["ts", "d.ts", "c++", "tar.gz"])(
    "akzeptiert die kanonische Endung %s",
    (extension) => {
      expect(fileExtensionSchema.parse(extension)).toBe(extension);
    },
  );

  it.each([".ts", "TS", "../ts", "a..b", "ts."])(
    "weist die unsichere Endung %s ab",
    (extension) => {
      expect(fileExtensionSchema.safeParse(extension).success).toBe(false);
    },
  );

  it("akzeptiert exakte extensionlose und versteckte Dateinamen", () => {
    expect(fileNameSchema.parse("Dockerfile")).toBe("Dockerfile");
    expect(fileNameSchema.parse(".env")).toBe(".env");
    expect(fileNameSchema.safeParse("../Dockerfile").success).toBe(false);
    expect(fileNameSchema.safeParse("folder/file").success).toBe(false);
  });

  it.each(["text/markdown", "image/*", "application/vnd.api+json"])(
    "akzeptiert den MIME Matcher %s",
    (mimeType) => {
      expect(fileMimeTypeSchema.parse(mimeType)).toBe(mimeType);
    },
  );

  it.each(["TEXT/plain", "text", "text/*+json", "text/plain; charset=utf-8"])(
    "weist den ungültigen MIME Matcher %s ab",
    (mimeType) => {
      expect(fileMimeTypeSchema.safeParse(mimeType).success).toBe(false);
    },
  );

  it("verlangt mindestens einen Matcher und eindeutige Werte", () => {
    expect(
      fileMatcherSchema.safeParse({ caseSensitiveFileNames: false }).success,
    ).toBe(false);
    expect(
      fileMatcherSchema.safeParse({
        extensions: ["md", "md"],
        caseSensitiveFileNames: false,
      }).success,
    ).toBe(false);
    expect(
      fileMatcherSchema.safeParse({
        fileNames: ["README", "readme"],
        caseSensitiveFileNames: false,
      }).success,
    ).toBe(false);
    expect(
      fileMatcherSchema.safeParse({
        mimeTypes: Array.from(
          { length: FILE_MATCH_VALUES_MAX_COUNT + 1 },
          (_, index) => `application/x-format-${index}`,
        ),
        caseSensitiveFileNames: true,
      }).success,
    ).toBe(false);
  });
});

describe("File Contributions V1", () => {
  it("akzeptiert Viewer mit kontrollierten Surfaces und Content Modes", () => {
    expect(fileContributionSchema.safeParse(viewer).success).toBe(true);
  });

  it("akzeptiert Open-With-Commands mit demselben Matcher", () => {
    expect(
      fileContributionSchema.safeParse({
        id: "workbench.markdown.file.open",
        kind: "opener",
        title: "Im Markdown Editor öffnen",
        matcher: viewer.matcher,
        priority: 60,
        commandId: "workbench.markdown.command.open",
      }).success,
    ).toBe(true);
  });

  it("weist unbekannte Surfaces, Content Modes, Prioritäten und freie Felder ab", () => {
    expect(
      fileContributionSchema.safeParse({
        ...viewer,
        surfaces: ["editor"],
      }).success,
    ).toBe(false);
    expect(
      fileContributionSchema.safeParse({
        ...viewer,
        contentMode: "path",
      }).success,
    ).toBe(false);
    expect(
      fileContributionSchema.safeParse({
        ...viewer,
        priority: FILE_PRIORITY_MAX + 1,
      }).success,
    ).toBe(false);
    expect(
      fileContributionSchema.safeParse({
        ...viewer,
        glob: "**/*.md",
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Contribution-Listen ab", () => {
    expect(fileContributionsSchema.safeParse([]).success).toBe(false);
    expect(fileContributionsSchema.safeParse([viewer, viewer]).success).toBe(
      false,
    );
    expect(
      fileContributionsSchema.safeParse(
        Array.from(
          { length: FILE_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...viewer,
            id: `workbench.markdown.file.viewer-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
