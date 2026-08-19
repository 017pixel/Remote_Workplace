import { useCallback, useEffect, useRef, useState } from "react";

/** Interner Pfad innerhalb der Hermes-SPA, z. B. `/cron`. */
export function safeHermesPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.split("/").includes("..")) return "/";
  return value;
}

function frameUrl(path: string): string {
  return `/hermes${path === "/" ? "/" : path}`;
}

/**
 * Die offizielle Hermes-Oberfläche, eingebettet unter `/hermes`.
 *
 * Das Iframe wird bewusst genau einmal montiert und danach nicht über `src`
 * umgehängt: Seitenwechsel laufen über die Routen-Brücke, die der Proxy in das
 * HTML injiziert (`dashboard-proxy.ts`). Damit wechselt die SPA intern in
 * Millisekunden, statt bei jedem Klick komplett neu zu laden.
 *
 * Antwortet die Brücke nicht (etwa weil Hermes sein HTML geändert hat), fällt
 * die Komponente auf eine echte Iframe-Navigation zurück — langsamer, aber ein
 * Klick bleibt nie wirkungslos.
 */
export function HermesAdminFrame({ path, active = true, onPathChange }: { path: string; active?: boolean; onPathChange: (path: string) => void }) {
  const safePath = safeHermesPath(path);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Der erste Pfad bestimmt das `src`. Spätere Wechsel laufen über die Brücke.
  const mountedSrc = useRef(frameUrl(safePath));
  const reportedPath = useRef(safePath);
  const sendActivity = useCallback(() => frameRef.current?.contentWindow?.postMessage(
    { source: "wrapt-hermes", version: 1, type: "host.activity", active },
    window.location.origin,
  ), [active]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: unknown; version?: unknown; type?: unknown; path?: unknown } | null;
      if (data?.source !== "wrapt-hermes" || data.version !== 1 || data.type !== "route.changed" || typeof data.path !== "string") return;
      if (!data.path.startsWith("/hermes")) return;
      const next = safeHermesPath(data.path.slice("/hermes".length) || "/");
      reportedPath.current = next;
      onPathChange(next);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onPathChange]);

  // Von außen angeforderter Seitenwechsel (Workbench-Navigation, Deep-Link).
  useEffect(() => {
    if (safePath === reportedPath.current) return;
    const target = frameUrl(safePath);
    frameRef.current?.contentWindow?.postMessage(
      { source: "wrapt-hermes", version: 1, type: "route.navigate", path: target },
      window.location.origin,
    );
    const fallback = window.setTimeout(() => {
      if (reportedPath.current === safePath) return;
      mountedSrc.current = target;
      setReloadToken((token) => token + 1);
    }, 700);
    return () => window.clearTimeout(fallback);
  }, [safePath]);

  useEffect(() => { sendActivity(); }, [sendActivity]);

  return (
    <section className="hermes-admin-frame" aria-label="Hermes Agent">
      <iframe key={reloadToken} ref={frameRef} src={mountedSrc.current} onLoad={sendActivity} title="Hermes Agent" className="hermes-admin-iframe" />
    </section>
  );
}
