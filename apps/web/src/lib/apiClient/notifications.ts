import {
  notificationListResponseSchema,
  notificationPreferencesSchema,
  notificationReportSchema,
  notificationSchema,
  notificationSettingsResponseSchema,
  pushSubscriptionRegistrationSchema,
  pushSubscriptionResponseSchema,
  pushTestResponseSchema,
  type NotificationPresenceItem,
} from "@wrapt/contracts";
import { z } from "zod";
import { mutate, request } from "./transport.js";

export const notificationsApi = {
  notifications: (params: { unreadOnly?: boolean; source?: string; category?: string; severity?: string; cursor?: string; limit?: number } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.unreadOnly) query.set("unreadOnly", "true");
    if (params.source) query.set("source", params.source);
    if (params.category) query.set("category", params.category);
    if (params.severity) query.set("severity", params.severity);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    return request(`/notifications${query.size ? `?${query}` : ""}`, notificationListResponseSchema, signal);
  },
  patchNotification: (id: string, body: { read?: boolean; acknowledged?: boolean }) => mutate(`/notifications/${encodeURIComponent(id)}`, "PATCH", notificationSchema.nullable(), body),
  updatePresence: (presence: NotificationPresenceItem | NotificationPresenceItem[] | null) => mutate("/notifications/presence", "PUT", z.object({ updated: z.number().int().nonnegative() }), presence),
  markAllNotificationsRead: (category?: string) => mutate("/notifications/mark-all-read", "POST", notificationListResponseSchema, category ? { category } : {}),
  deleteAllNotifications: () => mutate("/notifications", "DELETE", null),
  deleteNotification: (id: string) => mutate(`/notifications/${encodeURIComponent(id)}`, "DELETE", null),
  notificationReport: (id: string, signal?: AbortSignal) => request(`/notifications/${encodeURIComponent(id)}/report`, z.object({ report: notificationReportSchema }), signal),
  notificationSettings: (signal?: AbortSignal) => request("/notifications/settings", notificationSettingsResponseSchema, signal),
  saveNotificationSettings: (preferences: unknown) => mutate("/notifications/settings", "PUT", notificationSettingsResponseSchema, notificationPreferencesSchema.parse(preferences)),
  subscribePush: (subscription: unknown) => mutate("/notifications/push-subscription", "POST", pushSubscriptionResponseSchema, pushSubscriptionRegistrationSchema.parse(subscription)),
  unsubscribePush: (endpoint: string) => mutate("/notifications/push-subscription", "DELETE", null, { endpoint }),
  testPush: (endpoint: string) => mutate("/notifications/push-test", "POST", pushTestResponseSchema, { endpoint }),
  createCrashNotification: (body: unknown) => mutate("/notifications/report", "POST", notificationSchema, body),
};
