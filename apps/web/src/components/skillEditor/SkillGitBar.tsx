import { useState } from "react";
import type { SkillEditorGitResponse, SkillEditorRepositoryStatus } from "@workbench/contracts";
import { ConfirmDialog } from "../ModalDialog";
import { CheckIcon, CopyIcon, GitBranchIcon, LoaderIcon, UploadIcon, WarningIcon } from "../icons";
import { writeClipboardText } from "../../lib/clipboard";

interface SkillGitBarProps {
  repository: SkillEditorRepositoryStatus | null;
  result: SkillEditorGitResponse | null;
  busy: boolean;
  onCommit: () => void;
}

/** Committet und pusht das Skills-Repository — Nachricht wird regelbasiert gebaut. */
export function SkillGitBar({ repository, result, busy, onCommit }: SkillGitBarProps) {
  const [confirming, setConfirming] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="skill-git-bar">
      <div className="skill-git-summary">
        <GitBranchIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="skill-git-branch">{repository?.branch ?? "unbekannt"}</span>
        <span className="skill-git-count">
          {repository === null ? "Status nicht lesbar"
            : repository.dirtyCount === 0 ? "keine offenen Änderungen"
              : `${repository.dirtyCount} offene Änderung${repository.dirtyCount === 1 ? "" : "en"}`}
        </span>
      </div>

      <button
        type="button"
        className="quiet-button-primary skill-git-action"
        disabled={busy || repository === null || repository.dirtyCount === 0}
        onClick={() => setConfirming(true)}
      >
        {busy ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <UploadIcon className="h-3.5 w-3.5" />}
        Committen und pushen
      </button>

      {result ? (
        <div className={`skill-git-result ${result.pushed ? "is-ok" : result.committed ? "is-pending" : "is-bad"}`} role="status">
          <p>
            {result.pushed ? <CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <WarningIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span>{result.message ?? result.notice ?? "Keine Änderungen."}</span>
          </p>
          {result.changedSkills.length > 0 ? (
            <p className="skill-git-changes">
              {result.changedSkills.map((change) => `${change.name} (${change.action})`).join(", ")}
            </p>
          ) : null}
          {result.notice && result.message ? <p className="skill-git-changes">{result.notice}</p> : null}
          {result.errorTail ? (
            <div className="skill-git-log">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="quiet-button" onClick={() => setLogOpen(!logOpen)}>
                  {logOpen ? "Log ausblenden" : "Log anzeigen"}
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    void writeClipboardText(result.errorTail ?? "").then(() => setCopied(true)).catch(() => setCopied(false));
                  }}
                >
                  <CopyIcon className="h-3.5 w-3.5" /> {copied ? "Kopiert" : "Log kopieren"}
                </button>
              </div>
              {logOpen ? <pre className="restart-log">{result.errorTail}</pre> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Änderungen committen und pushen"
        description="Alle Änderungen im Skills-Repository werden committet und ins Remote-Repository gepusht. Ein Push lässt sich nicht ohne Weiteres zurücknehmen."
        confirmLabel="Committen und pushen"
        onConfirm={onCommit}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
