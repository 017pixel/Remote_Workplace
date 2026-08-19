import type { ReactNode } from "react";
import type { OrbitNode } from "@wrapt/contracts";

export interface OrbitNodeRenderer {
  readonly render: (node: OrbitNode) => ReactNode;
}

export const orbitNodeRendererErrorCodes = [
  "invalid-contribution-id",
  "renderer-collision",
] as const;
export type OrbitNodeRendererErrorCode =
  (typeof orbitNodeRendererErrorCodes)[number];

export class OrbitNodeRendererError extends Error {
  readonly code: OrbitNodeRendererErrorCode;
  readonly contributionId: string;

  constructor(code: OrbitNodeRendererErrorCode, message: string, contributionId: string) {
    super(message);
    this.name = "OrbitNodeRendererError";
    this.code = code;
    this.contributionId = contributionId;
  }
}

const contributionPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,}$/;

/**
 * UI-Runtime-Registry für Extension-Orbit-Renderer. Ein UI-Entrypoint
 * registriert genau einen Renderer pro Contribution-ID; eine doppelte
 * Registrierung überschreibt nie still einen bestehenden Renderer.
 */
export class OrbitNodeRendererRegistry {
  private readonly renderers = new Map<string, OrbitNodeRenderer>();

  registerRenderer(contributionId: string, renderer: OrbitNodeRenderer): void {
    if (!contributionPattern.test(contributionId)) {
      throw new OrbitNodeRendererError(
        "invalid-contribution-id",
        "Eine vollständig namespaced Contribution ID wird erwartet.",
        contributionId,
      );
    }
    const existing = this.renderers.get(contributionId);
    if (existing !== undefined) {
      throw new OrbitNodeRendererError(
        "renderer-collision",
        "Für diese Contribution ID ist bereits ein Renderer registriert.",
        contributionId,
      );
    }
    this.renderers.set(contributionId, renderer);
  }

  unregisterRenderer(contributionId: string): boolean {
    return this.renderers.delete(contributionId);
  }

  getRenderer(contributionId: string | null): OrbitNodeRenderer | undefined {
    if (contributionId === null) return undefined;
    return this.renderers.get(contributionId);
  }
}

export const orbitNodeRendererRegistry = new OrbitNodeRendererRegistry();
