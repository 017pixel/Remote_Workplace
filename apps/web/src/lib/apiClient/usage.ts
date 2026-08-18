import {
  accountResponseSchema,
  accountsResponseSchema,
  activateAccountResponseSchema,
  commandsResponseSchema,
  discoveredAccountsResponseSchema,
  loginSessionResponseSchema,
  usageDashboardResponseSchema,
  usageResponseSchema,
  usageSyncStatusSchema,
  usageTimelineResponseSchema,
  type CreateAccountRequest,
  type UpdateAccountRequest,
} from "@workbench/contracts";
import { mutate, request } from "./transport.js";

export const usageApi = {
  commands: (signal?: AbortSignal) => request("/commands", commandsResponseSchema, signal),
  usage: (signal?: AbortSignal) => request("/usage", usageResponseSchema, signal),
  usageTimeline: (signal?: AbortSignal) => request("/usage/timeline", usageTimelineResponseSchema, signal),
  usageDashboard: (range: string, signal?: AbortSignal) => request(`/usage/dashboard?range=${encodeURIComponent(range)}`, usageDashboardResponseSchema, signal),
  syncUsage: () => mutate("/usage/sync", "POST", usageDashboardResponseSchema),
  usageSyncStatus: (signal?: AbortSignal) => request("/usage/sync/status", usageSyncStatusSchema, signal),
  accounts: (signal?: AbortSignal) => request("/accounts", accountsResponseSchema, signal),
  discoverAccounts: (signal?: AbortSignal) => request("/accounts/discover", discoveredAccountsResponseSchema, signal),
  createAccount: (body: CreateAccountRequest) => mutate("/accounts", "POST", accountResponseSchema, body),
  startLogin: (body: Omit<CreateAccountRequest, "source">) => mutate("/accounts/login-session", "POST", loginSessionResponseSchema, body),
  updateAccount: (id: string, body: UpdateAccountRequest) => mutate(`/accounts/${encodeURIComponent(id)}`, "PATCH", accountResponseSchema, body),
  deleteAccount: (id: string) => mutate(`/accounts/${encodeURIComponent(id)}`, "DELETE", null),
  activateAccount: (id: string) => mutate(`/accounts/${encodeURIComponent(id)}/activate`, "POST", activateAccountResponseSchema),
};
