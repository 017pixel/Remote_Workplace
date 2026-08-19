import {
  hermesCronResponseSchema,
  hermesResultsResponseSchema,
  hermesStatusSchema,
  hermesTasksResponseSchema,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const hermesApi = {
  hermesStatus: (signal?: AbortSignal) => request("/hermes/status", hermesStatusSchema, signal),
  hermesTasks: (signal?: AbortSignal) => request("/hermes/tasks", hermesTasksResponseSchema, signal),
  cancelHermesTask: (sessionId: string) => mutate(`/hermes/tasks/${encodeURIComponent(sessionId)}/cancel`, "POST", null),
  hermesCron: (signal?: AbortSignal) => request("/hermes/cron", hermesCronResponseSchema, signal),
  hermesResults: (params: { source?: string; status?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.source) query.set("source", params.source);
    if (params.status) query.set("status", params.status);
    return request(`/hermes/results${query.size ? `?${query}` : ""}`, hermesResultsResponseSchema, signal);
  },
};
