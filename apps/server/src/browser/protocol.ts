import { z } from "zod";

const browserSessionId = z.string().uuid();
const dimensions = z.object({
  width: z.number().int().min(320).max(2_400),
  height: z.number().int().min(220).max(1_600),
});
const modifiers = z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).max(4).default([]);

export const clientBrowserMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("browser.create"), requestId: z.string().min(1).max(128), instanceId: z.string().min(1).max(100), ...dimensions.shape }),
  z.object({ type: z.literal("browser.attach"), sessionId: browserSessionId, ...dimensions.shape }),
  z.object({ type: z.literal("browser.resize"), sessionId: browserSessionId, ...dimensions.shape }),
  z.object({
    type: z.literal("browser.navigate"),
    sessionId: browserSessionId,
    url: z.union([z.literal("about:blank"), z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol))]),
  }),
  z.object({ type: z.literal("browser.reload"), sessionId: browserSessionId }),
  z.object({ type: z.literal("browser.back"), sessionId: browserSessionId }),
  z.object({ type: z.literal("browser.forward"), sessionId: browserSessionId }),
  z.object({
    type: z.literal("browser.pointer"), sessionId: browserSessionId,
    action: z.enum(["move", "down", "up"]),
    x: z.number().finite().min(0).max(2_400), y: z.number().finite().min(0).max(1_600),
    button: z.enum(["left", "middle", "right", "none"]).default("none"),
    buttons: z.number().int().min(0).max(7).default(0),
  }),
  z.object({
    type: z.literal("browser.wheel"), sessionId: browserSessionId,
    x: z.number().finite().min(0).max(2_400), y: z.number().finite().min(0).max(1_600),
    deltaX: z.number().finite().min(-10_000).max(10_000), deltaY: z.number().finite().min(-10_000).max(10_000),
  }),
  z.object({ type: z.literal("browser.key"), sessionId: browserSessionId, key: z.string().min(1).max(40), code: z.string().max(40), modifiers }),
  z.object({ type: z.literal("browser.text"), sessionId: browserSessionId, text: z.string().min(1).max(65_536) }),
  z.object({ type: z.literal("browser.screenshot"), sessionId: browserSessionId }),
  z.object({ type: z.literal("browser.source"), sessionId: browserSessionId }),
  z.object({ type: z.literal("browser.close"), sessionId: browserSessionId }),
  z.object({ type: z.literal("browser.ping") }),
]);

export type ClientBrowserMessage = z.infer<typeof clientBrowserMessageSchema>;
export type BrowserErrorCode =
  | "UNAUTHORIZED" | "FORBIDDEN" | "SESSION_NOT_FOUND" | "SESSION_NOT_OWNED"
  | "TOO_MANY_SESSIONS" | "BROWSER_START_FAILED" | "INVALID_MESSAGE" | "INTERNAL_ERROR";

export type ServerBrowserMessage =
  | { type: "browser.ready"; requestId?: string; sessionId: string; url: string; title: string; width: number; height: number }
  | { type: "browser.state"; sessionId: string; url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean }
  | { type: "browser.frame"; sessionId: string; data: string; width: number; height: number }
  | { type: "browser.screenshot"; sessionId: string; data: string }
  | { type: "browser.source"; sessionId: string; source: string; url: string }
  | { type: "browser.closed"; sessionId: string }
  | { type: "browser.error"; sessionId?: string; code: BrowserErrorCode; message: string }
  | { type: "browser.pong" };
