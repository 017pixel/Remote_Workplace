import { describe, expect, it } from "vitest";
import {
  SETTING_DURATION_MAX_MILLISECONDS,
  SETTING_FIELDS_MAX_COUNT,
  SETTING_OPTIONS_MAX_COUNT,
  SETTING_STRING_MAX_LENGTH,
  SETTINGS_CONTRIBUTIONS_MAX_COUNT,
  durationSettingFieldSchema,
  enumSettingFieldSchema,
  multiSelectSettingFieldSchema,
  numberSettingFieldSchema,
  settingContributionSchema,
  settingFieldSchema,
  settingFieldsSchema,
  settingOptionsSchema,
  settingUrlValueSchema,
  settingsContributionsSchema,
  stringSettingFieldSchema,
} from "./settings-contributions.js";

const booleanField = {
  id: "workbench.agent-tasks.setting.notifications",
  type: "boolean",
  label: "Benachrichtigungen",
  default: true,
} as const;

const options = [
  { value: "compact", label: "Kompakt" },
  { value: "comfortable", label: "Komfortabel" },
] as const;

describe("Settings Fields V1", () => {
  it("füllt sichere Defaults für String-Felder", () => {
    expect(
      stringSettingFieldSchema.parse({
        id: "workbench.agent-tasks.setting.title",
        type: "string",
        label: "Standardtitel",
      }),
    ).toEqual({
      id: "workbench.agent-tasks.setting.title",
      type: "string",
      label: "Standardtitel",
      required: false,
      minLength: 0,
      maxLength: SETTING_STRING_MAX_LENGTH,
      multiline: false,
    });
  });

  it.each([
    {
      id: "workbench.agent-tasks.setting.title",
      type: "string",
      label: "Titel",
      default: "Aufgabe",
    },
    {
      id: "workbench.agent-tasks.setting.limit",
      type: "number",
      label: "Limit",
      default: 10,
    },
    booleanField,
    {
      id: "workbench.agent-tasks.setting.layout",
      type: "enum",
      label: "Layout",
      options,
    },
    {
      id: "workbench.agent-tasks.setting.tags",
      type: "multi-select",
      label: "Tags",
      options,
    },
    { id: "workbench.agent-tasks.setting.root", type: "path", label: "Ordner" },
    {
      id: "workbench.agent-tasks.setting.endpoint",
      type: "url",
      label: "Endpoint",
    },
    {
      id: "workbench.agent-tasks.setting.token",
      type: "secret",
      label: "Token",
    },
    {
      id: "workbench.agent-tasks.setting.project",
      type: "project",
      label: "Projekt",
    },
    {
      id: "workbench.agent-tasks.setting.timeout",
      type: "duration",
      label: "Timeout",
    },
  ])("akzeptiert den Feldtyp $type", (field) => {
    expect(settingFieldSchema.safeParse(field).success).toBe(true);
  });

  it("prüft String- und Number-Defaults gegen ihre Grenzen", () => {
    expect(
      stringSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.template",
        type: "string",
        label: "Vorlage",
        default: "Zeile 1\nZeile 2",
        multiline: true,
      }).success,
    ).toBe(true);
    expect(
      stringSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.title",
        type: "string",
        label: "Titel",
        default: "kurz",
        minLength: 10,
        maxLength: 20,
      }).success,
    ).toBe(false);
    expect(
      stringSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.title",
        type: "string",
        label: "Titel",
        minLength: 20,
        maxLength: 10,
      }).success,
    ).toBe(false);
    expect(
      numberSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.limit",
        type: "number",
        label: "Limit",
        default: 11,
        minimum: 1,
        maximum: 10,
      }).success,
    ).toBe(false);
    expect(
      numberSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.limit",
        type: "number",
        label: "Limit",
        minimum: 10,
        maximum: 1,
      }).success,
    ).toBe(false);
  });

  it("verlangt eindeutige Optionen und bekannte Enum-Defaults", () => {
    expect(
      settingOptionsSchema.safeParse([...options, options[0]]).success,
    ).toBe(false);
    expect(
      settingOptionsSchema.safeParse(
        Array.from({ length: SETTING_OPTIONS_MAX_COUNT + 1 }, (_, index) => ({
          value: `option-${index}`,
          label: `Option ${index}`,
        })),
      ).success,
    ).toBe(false);
    expect(
      enumSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.layout",
        type: "enum",
        label: "Layout",
        options,
        default: "missing",
      }).success,
    ).toBe(false);
  });

  it("verlangt eindeutige und bekannte Multi-Select-Defaults", () => {
    expect(
      multiSelectSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.tags",
        type: "multi-select",
        label: "Tags",
        options,
        default: ["compact", "missing"],
      }).success,
    ).toBe(false);
    expect(
      multiSelectSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.tags",
        type: "multi-select",
        label: "Tags",
        options,
        default: ["compact", "compact"],
      }).success,
    ).toBe(false);
  });

  it("begrenzt URL-Schemata und hält Secrets frei von Defaults", () => {
    expect(
      settingUrlValueSchema.safeParse("https://api.example.com/v1").success,
    ).toBe(true);
    expect(
      settingUrlValueSchema.safeParse("http://127.0.0.1:8080").success,
    ).toBe(true);
    expect(
      settingUrlValueSchema.safeParse("ftp://example.com/file").success,
    ).toBe(false);
    expect(settingUrlValueSchema.safeParse("javascript:alert(1)").success).toBe(
      false,
    );
    expect(settingUrlValueSchema.safeParse("keine-url").success).toBe(false);
    expect(
      settingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.token",
        type: "secret",
        label: "Token",
        default: "secret-value",
      }).success,
    ).toBe(false);
  });

  it("speichert Duration-Werte normalisiert in Millisekunden", () => {
    expect(
      durationSettingFieldSchema.parse({
        id: "workbench.agent-tasks.setting.timeout",
        type: "duration",
        label: "Timeout",
        defaultMilliseconds: 30_000,
      }),
    ).toMatchObject({
      required: false,
      minimumMilliseconds: 0,
      maximumMilliseconds: SETTING_DURATION_MAX_MILLISECONDS,
      displayUnit: "seconds",
    });
    expect(
      durationSettingFieldSchema.safeParse({
        id: "workbench.agent-tasks.setting.timeout",
        type: "duration",
        label: "Timeout",
        defaultMilliseconds: 31_000,
        minimumMilliseconds: 1_000,
        maximumMilliseconds: 30_000,
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Feldlisten ab", () => {
    expect(settingFieldsSchema.safeParse([]).success).toBe(false);
    expect(
      settingFieldsSchema.safeParse([booleanField, booleanField]).success,
    ).toBe(false);
    expect(
      settingFieldsSchema.safeParse(
        Array.from({ length: SETTING_FIELDS_MAX_COUNT + 1 }, (_, index) => ({
          ...booleanField,
          id: `workbench.agent-tasks.setting.field-${index}`,
        })),
      ).success,
    ).toBe(false);
  });
});

describe("Settings Contributions V1", () => {
  const settings = {
    id: "workbench.agent-tasks.settings.general",
    kind: "schema",
    title: "Agent Tasks",
    icon: "workbench.agent-tasks.icon.settings",
    order: 100,
    fields: [booleanField],
  } as const;

  it("füllt den benutzerbezogenen Scope als sicheren Default", () => {
    expect(settingContributionSchema.parse(settings)).toEqual({
      ...settings,
      scope: "user",
      fields: [{ ...booleanField, required: false }],
    });
  });

  it.each(["server", "user", "project"])("akzeptiert den Scope %s", (scope) => {
    expect(
      settingContributionSchema.safeParse({ ...settings, scope }).success,
    ).toBe(true);
  });

  it("akzeptiert eine eigene Settings Page als tatsächliche Page-Referenz", () => {
    expect(
      settingContributionSchema.safeParse({
        id: "workbench.agent-tasks.settings.advanced",
        kind: "page",
        title: "Erweitert",
        order: 200,
        scope: "server",
        pageId: "workbench.agent-tasks.page.settings",
      }).success,
    ).toBe(true);
  });

  it("weist leere, doppelte und übergroße Contribution-Listen ab", () => {
    expect(settingsContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      settingsContributionsSchema.safeParse([settings, settings]).success,
    ).toBe(false);
    expect(
      settingsContributionsSchema.safeParse(
        Array.from(
          { length: SETTINGS_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...settings,
            id: `workbench.agent-tasks.settings.section-${index}`,
            fields: [
              {
                ...booleanField,
                id: `workbench.agent-tasks.setting.field-${index}`,
              },
            ],
          }),
        ),
      ).success,
    ).toBe(false);
  });

  it("weist doppelte Field IDs über Sections hinweg ab", () => {
    expect(
      settingsContributionsSchema.safeParse([
        settings,
        {
          ...settings,
          id: "workbench.agent-tasks.settings.notifications",
        },
      ]).success,
    ).toBe(false);
  });
});
