import { ExternalLinkIcon, ServerIcon } from "../icons";

/**
 * Externe Adressen laufen nie über den lokalen Preview-Gateway. Sie werden
 * im echten Client-Browser geöffnet. Das Browser-Werkzeug kann zusätzlich
 * seinen Server-Chromium anbieten; reine Previews bleiben immer direkt.
 */
export function ExternalPreviewChoice({ url, onUseChromium }: { url: string; onUseChromium?: () => void }) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Unparsbare Eingaben werden unverändert angezeigt.
  }
  return (
    <div className="preview-external-choice">
      <strong>Externe Adresse</strong>
      <code>{host}</code>
      <p>
        Externe Websites laufen nicht über die lokalen Preview-Slots. Sie können Embedding blockieren, eigene Cookies
        benötigen und gehören deshalb in einen echten Browser.
      </p>
      <div>
        <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon className="h-3.5 w-3.5" />Im Browser öffnen</a>
        {onUseChromium ? <button type="button" onClick={onUseChromium}><ServerIcon className="h-3.5 w-3.5" />Server-Chromium verwenden</button> : null}
      </div>
    </div>
  );
}
