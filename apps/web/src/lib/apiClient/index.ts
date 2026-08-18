import { extensionsApi } from "./extensions.js";
import { filesystemApi } from "./filesystem.js";
import { hermesApi } from "./hermes.js";
import { newsApi } from "./news.js";
import { notificationsApi } from "./notifications.js";
import { orbitApi } from "./orbit.js";
import { previewsApi } from "./previews.js";
import { projectsApi } from "./projects.js";
import { skillsApi } from "./skills.js";
import { systemApi } from "./system.js";
import { terminalApi } from "./terminal.js";
import { usageApi } from "./usage.js";
import { ApiClientError } from "./transport.js";

export { ApiClientError };

export const apiClient = {
  ...systemApi,
  ...extensionsApi,
  ...hermesApi,
  ...notificationsApi,
  ...previewsApi,
  ...projectsApi,
  ...filesystemApi,
  ...skillsApi,
  ...usageApi,
  ...orbitApi,
  ...terminalApi,
  ...newsApi,
};
