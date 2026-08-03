import type { HermesApproval } from "@workbench/contracts";

function remaining(expiresAt: string): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000));
  return seconds > 0 ? `${seconds} s verbleibend` : "Abgelaufen";
}

export function HermesApprovalCard({ request, onRespond }: { request: HermesApproval; onRespond: (option: "allow_once" | "allow_session" | "deny") => void }) {
  return (
    <section className={`hermes-approval-card is-${request.risk}`} aria-label="Hermes-Freigabe">
      <div className="hermes-approval-kicker">Freigabe erforderlich · {remaining(request.expiresAt)}</div>
      <strong>{request.title}</strong>
      <p>{request.description || "Hermes benötigt eine Bestätigung für diesen Vorgang."}</p>
      {request.command ? <code className="hermes-command-preview">{request.command}</code> : null}
      <div className="hermes-approval-actions">
        <button type="button" className="quiet-button" onClick={() => onRespond("deny")}>Ablehnen</button>
        {request.options.includes("allow_session") ? <button type="button" className="quiet-button" onClick={() => onRespond("allow_session")}>Für diese Session erlauben</button> : null}
        {request.options.includes("allow_once") ? <button type="button" className="quiet-button-primary" onClick={() => onRespond("allow_once")}>Einmal erlauben</button> : null}
      </div>
    </section>
  );
}
