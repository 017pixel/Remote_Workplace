import {
  projectActivityTouchResponseSchema,
  projectFileResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  registerProjectResponseSchema,
  type CreateProjectFileRequest,
  type RegisterProjectRequest,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const projectsApi = {
  projects: (signal?: AbortSignal) => request("/projects", projectsResponseSchema, signal),
  project: (projectId: string, signal?: AbortSignal) =>
    request(`/projects/${encodeURIComponent(projectId)}`, projectResponseSchema, signal),
  touchProject: (projectId: string) => mutate(`/projects/${encodeURIComponent(projectId)}/activity`, "POST", projectActivityTouchResponseSchema),
  registerProject: (body: RegisterProjectRequest) => mutate("/projects/register", "POST", registerProjectResponseSchema, body),
  createProjectFile: (projectId: string, body: CreateProjectFileRequest) =>
    mutate(`/projects/${encodeURIComponent(projectId)}/files`, "POST", projectFileResponseSchema, body),
};
