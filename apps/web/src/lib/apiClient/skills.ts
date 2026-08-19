import {
  skillEditorCreateResponseSchema,
  skillEditorGitResponseSchema,
  skillEditorReadResponseSchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  type SkillEditorCreateRequest,
  type SkillEditorWriteRequest,
} from "@wrapt/contracts";
import { mutate, request, WRAPT_SYNC_VERSION } from "./transport.js";

/**
 * Letzte Rettung beim Schließen der Seite: `keepalive` lässt den Browser die
 * Anfrage auch nach dem Entladen des Dokuments zu Ende senden. Fehler bleiben
 * hier bewusst still — sichtbar wäre die Meldung ohnehin nicht mehr.
 */
function saveSkillEditorFileOnUnload(body: SkillEditorWriteRequest): void {
  void fetch("/api/v1/skills/file", {
    method: "PUT",
    keepalive: true,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Wrapt-Sync-Version": WRAPT_SYNC_VERSION },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export const skillsApi = {
  skillEditorStatus: (signal?: AbortSignal) => request("/skills/status", skillEditorStatusResponseSchema, signal),
  skillEditorTree: (signal?: AbortSignal) => request("/skills/tree", skillEditorTreeResponseSchema, signal),
  skillEditorRead: (path: string, signal?: AbortSignal) =>
    request(`/skills/file?path=${encodeURIComponent(path)}`, skillEditorReadResponseSchema, signal),
  saveSkillEditorFile: (body: SkillEditorWriteRequest) => mutate("/skills/file", "PUT", skillEditorReadResponseSchema, body),
  saveSkillEditorFileOnUnload,
  createSkill: (body: SkillEditorCreateRequest) => mutate("/skills", "POST", skillEditorCreateResponseSchema, body),
  renameSkill: (name: string, newName: string) => mutate("/skills/rename", "POST", skillEditorCreateResponseSchema, { name, newName }),
  deleteSkill: (name: string) => mutate(`/skills/${encodeURIComponent(name)}`, "DELETE", null),
  commitSkills: () => mutate("/skills/git", "POST", skillEditorGitResponseSchema),
};
