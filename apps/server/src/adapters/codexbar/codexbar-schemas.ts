import { z } from "zod";

const timestampSchema = z.iso.datetime({ offset: true }).nullable().optional();

const rawWindowSchema = z
  .object({
    usedPercent: z.number().min(0).max(100).optional(),
    windowMinutes: z.number().int().positive().optional(),
    resetsAt: timestampSchema,
  })
  .nullable()
  .optional();

const rawUsageSchema = z
  .object({
    accountEmail: z.string().email().optional(),
    loginMethod: z.string().min(1).optional(),
    updatedAt: timestampSchema,
    identity: z
      .object({
        accountEmail: z.string().email().optional(),
        loginMethod: z.string().min(1).optional(),
      })
      .optional(),
    primary: rawWindowSchema,
    secondary: rawWindowSchema,
    tertiary: rawWindowSchema,
    dataConfidence: z.string().optional(),
    codexResetCredits: z.object({
      availableCount: z.number().int().nonnegative().optional(),
      updatedAt: timestampSchema,
      credits: z.array(z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().default(""),
        status: z.string().min(1),
        granted_at: timestampSchema,
        expires_at: timestampSchema,
      }).passthrough()).default([]),
    }).optional(),
  })
  .optional();

export const codexbarPayloadSchema = z.object({
  provider: z.string().min(1),
  source: z.string().min(1).optional(),
  account: z.string().min(1).optional(),
  usage: rawUsageSchema,
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().min(1).optional(),
    })
    .optional(),
});

export const codexbarUsageResponseSchema = z.array(codexbarPayloadSchema);

const modelBreakdownSchema = z.object({
  modelName: z.string().min(1),
  totalTokens: z.number().int().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
}).passthrough();
const dailyCostSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheCreationTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative().default(0),
  modelBreakdowns: z.array(modelBreakdownSchema).default([]),
}).passthrough();
const projectCostSchema = z.object({
  project: z.string().optional(),
  projectPath: z.string().optional(),
  name: z.string().optional(),
  totalTokens: z.number().int().nonnegative().default(0),
  totalCost: z.number().nonnegative().default(0),
}).passthrough();
export const codexbarCostPayloadSchema = z.object({
  provider: z.string().min(1),
  source: z.string().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
  daily: z.array(dailyCostSchema).default([]),
  projects: z.array(projectCostSchema).default([]),
}).passthrough();
export const codexbarCostResponseSchema = z.array(codexbarCostPayloadSchema);

export type CodexbarPayload = z.infer<typeof codexbarPayloadSchema>;
export type CodexbarCostPayload = z.infer<typeof codexbarCostPayloadSchema>;
