import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SkillEditorCreateResponse, SkillEditorFile, SkillEditorGitResponse, SkillEditorNode } from "@workbench/contracts";
import { apiClient } from "../lib/apiClient";
import { skillForPath, skillFrontmatterWarnings, useAutosave } from "../lib/skillEditor";
import { useResponsiveShell } from "../lib/useResponsiveShell";
import { usePaneWidth } from "../lib/usePaneWidth";
import { AutosaveStatus } from "../components/skillEditor/AutosaveStatus";
import { MarkdownEditor } from "../components/skillEditor/MarkdownEditor";
import { NewSkillDialog } from "../components/skillEditor/NewSkillDialog";
import { SkillGitBar } from "../components/skillEditor/SkillGitBar";
import { SkillTree } from "../components/skillEditor/SkillTree";
import { ConfirmDialog, PromptDialog } from "../components/ModalDialog";
import { CloseIcon, FolderTreeIcon, PlusIcon, SearchIcon } from "../components/icons";

const treeQueryKey = ["skills", "tree"] as const;
const statusQueryKey = ["skills", "status"] as const;

export function SkillEditor() {
  const queryClient = useQueryClient();
  const responsive = useResponsiveShell();
  const compact = responsive.isTouchShell;

  const status = useQuery({ queryKey: statusQueryKey, queryFn: ({ signal }) => apiClient.skillEditorStatus(signal), staleTime: 10_000 });
  const tree = useQuery({ queryKey: treeQueryKey, queryFn: ({ signal }) => apiClient.skillEditorTree(signal), staleTime: 10_000 });

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeQuery, setTreeQuery] = useState("");
  const treePaneWidth = usePaneWidth({ storageKey: "remote-workplace.skills.tree-width.v1", initial: 280, min: 200, max: 460 });
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SkillEditorNode | null>(null);
  const [deleting, setDeleting] = useState<SkillEditorNode | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [gitResult, setGitResult] = useState<SkillEditorGitResponse | null>(null);

  // Ohne Auswahl stehen die globalen Regeln im Editor — der häufigste Einstieg.
  useEffect(() => {
    if (selectedPath !== null || !tree.data) return;
    const fallback = tree.data.agentsFile?.path ?? tree.data.skills.find((skill) => !skill.broken)?.files[0]?.path ?? null;
    setSelectedPath(fallback);
  }, [selectedPath, tree.data]);

  const file = useQuery({
    queryKey: ["skills", "file", selectedPath],
    queryFn: ({ signal }) => apiClient.skillEditorRead(selectedPath!, signal),
    enabled: selectedPath !== null,
    staleTime: Infinity,
    retry: false,
  });

  const autosave = useAutosave({
    file: file.data ?? null,
    debounceMs: status.data?.autosaveDebounceMs ?? 2_500,
    onSaved: useCallback((saved) => {
      queryClient.setQueryData(["skills", "file", saved.path], saved);
      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
    }, [queryClient]),
  });

  const activeSkill = useMemo(() => skillForPath(tree.data?.skills ?? [], selectedPath), [selectedPath, tree.data?.skills]);
  const warnings = useMemo(
    () => (selectedPath?.endsWith("/SKILL.md") ? skillFrontmatterWarnings(autosave.content, activeSkill?.name ?? null) : []),
    [activeSkill?.name, autosave.content, selectedPath],
  );

  const refreshTree = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: treeQueryKey }),
      queryClient.invalidateQueries({ queryKey: statusQueryKey }),
    ]);
  }, [queryClient]);

  const openFile = useCallback(async (entry: SkillEditorFile) => {
    if (entry.path === selectedPath) return;
    // Erst den offenen Stand sichern, dann wechseln — sonst geht die Tippause verloren.
    await autosave.flush();
    setSelectedPath(entry.path);
    if (compact) setTreeOpen(false);
  }, [autosave, compact, selectedPath]);

  const applyResult = useCallback(async (result: SkillEditorCreateResponse, verb: string) => {
    await refreshTree();
    setSelectedPath(result.path);
    const parts = [`Skill „${result.name}" ${verb}.`];
    if (result.propagated.length > 0) parts.push(`An ${result.propagated.length} Ziel${result.propagated.length === 1 ? "" : "e"} verteilt.`);
    if (result.notice) parts.push(result.notice);
    else if (result.readmeUpdated) parts.push("README aktualisiert.");
    setActionMessage({ tone: "ok", text: parts.join(" ") });
  }, [refreshTree]);

  const failed = useCallback((error: unknown) => {
    setActionMessage({ tone: "bad", text: error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen." });
  }, []);

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description: string; license?: string }) => apiClient.createSkill(input),
    onSuccess: (result) => { if (result) void applyResult(result, "angelegt"); },
    onError: failed,
  });
  const renameMutation = useMutation({
    mutationFn: (input: { name: string; newName: string }) => apiClient.renameSkill(input.name, input.newName),
    onSuccess: (result) => { if (result) void applyResult(result, "umbenannt"); },
    onError: failed,
  });
  const deleteMutation = useMutation({
    mutationFn: (name: string) => apiClient.deleteSkill(name),
    onSuccess: async (_result, name) => {
      setSelectedPath(tree.data?.agentsFile?.path ?? null);
      await refreshTree();
      setActionMessage({ tone: "ok", text: `Skill „${name}" samt Verweisen entfernt.` });
    },
    onError: failed,
  });
  const gitMutation = useMutation({
    mutationFn: () => apiClient.commitSkills(),
    onSuccess: async (result) => {
      setGitResult(result ?? null);
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    },
    onError: failed,
  });

  const readError = file.isError ? (file.error instanceof Error ? file.error.message : "Die Datei konnte nicht geladen werden.") : null;

  const treePane = (
    <aside
      className={`skill-editor-tree-pane ${compact ? "is-drawer" : ""} ${treeOpen ? "is-open" : ""}`}
      style={compact ? undefined : { width: `${treePaneWidth.width}px` }}
    >
      <div className="skill-editor-pane-head">
        <span className="skill-editor-pane-title">Skill-Ordner</span>
        {compact ? (
          <button type="button" className="icon-button" onClick={() => setTreeOpen(false)} aria-label="Baum schließen">
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className="icon-button" onClick={() => setCreating(true)} aria-label="Neuen Skill anlegen" title="Neuen Skill anlegen">
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Bei über dreißig Skills ist Scrollen der langsamste Weg zum Ziel. */}
      <label className="skill-editor-tree-search" title="Skills filtern">
        <SearchIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Skills filtern</span>
        <input value={treeQuery} onChange={(event) => setTreeQuery(event.target.value)} placeholder="Skill suchen" spellCheck={false} />
        {treeQuery ? <button type="button" onClick={() => setTreeQuery("")} aria-label="Filter leeren"><CloseIcon className="h-3 w-3" /></button> : null}
      </label>
      {tree.isLoading ? <div className="file-manager-tree-skeleton"><span /><span /><span /><span /></div>
        : tree.isError ? <p className="file-manager-tree-error">Der Skill-Ordner konnte nicht gelesen werden.</p>
          : tree.data ? (
            <SkillTree
              tree={tree.data}
              selectedPath={selectedPath}
              onSelect={(entry) => void openFile(entry)}
              onCreate={() => setCreating(true)}
              onRename={setRenaming}
              onDelete={setDeleting}
              query={treeQuery}
            />
          ) : null}
      {tree.data ? <p className="skill-editor-root-path" title={tree.data.rootDirectory}>{tree.data.rootDirectory}</p> : null}
      {!compact ? <div
        className="pane-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite des Skill-Baums anpassen"
        aria-valuenow={treePaneWidth.width}
        aria-valuemin={treePaneWidth.min}
        aria-valuemax={treePaneWidth.max}
        tabIndex={0}
        onPointerDown={treePaneWidth.startResize}
        onKeyDown={treePaneWidth.resizeWithKeyboard}
      /> : null}
    </aside>
  );

  return (
    <div className="app-surface skill-editor-page">
      <div className={`app-surface-body skill-editor ${compact ? "is-compact" : ""}`}>
          {treePane}
          {compact && treeOpen ? <button type="button" className="app-surface-scrim" aria-label="Baum schließen" onClick={() => setTreeOpen(false)} /> : null}

          <section className="skill-editor-main">
            <header className="skill-editor-head">
              {compact ? (
                <button type="button" className="quiet-button skill-editor-tree-trigger" onClick={() => setTreeOpen(true)}>
                  <FolderTreeIcon className="h-3.5 w-3.5" /> Skills
                </button>
              ) : null}
              <span className="skill-editor-title">
                <span className="skill-editor-file-name">{file.data?.name ?? "Keine Datei gewählt"}</span>
                <span className="skill-editor-file-path" title={selectedPath ?? ""}>{activeSkill ? activeSkill.name : selectedPath ? "Globale Regeln" : ""}</span>
              </span>
              {file.data ? <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} /> : null}
            </header>

            {autosave.state.kind === "conflict" ? (
              <div className="skill-editor-alert is-bad" role="alert">
                <span>Diese Datei wurde außerhalb der Workbench geändert.</span>
                <span className="skill-editor-alert-actions">
                  <button type="button" className="quiet-button" onClick={() => void autosave.overwrite()}>Überschreiben</button>
                  <button type="button" className="quiet-button" onClick={() => void autosave.reload()}>Neu laden</button>
                </span>
              </div>
            ) : null}

            {actionMessage ? (
              <div className={`skill-editor-alert ${actionMessage.tone === "bad" ? "is-bad" : "is-ok"}`} role="status">
                <span>{actionMessage.text}</span>
                <button type="button" className="icon-button" onClick={() => setActionMessage(null)} aria-label="Hinweis schließen">
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {readError ? <p className="skill-editor-empty">{readError}</p>
              : file.isLoading ? <div className="file-manager-tree-skeleton"><span /><span /><span /><span /></div>
                : file.data ? (
                  <MarkdownEditor
                    value={autosave.content}
                    onChange={autosave.setContent}
                    onBlur={() => void autosave.flush()}
                    warnings={warnings}
                  />
                ) : (
                  <div className="skill-editor-empty">
                    <strong>Keine Datei geöffnet</strong>
                    <p>Globale Agenten-Regeln und Skills liegen direkt auf dem Server. Änderungen werden automatisch gespeichert, auch beim Schließen der Seite.</p>
                    <button type="button" className="quiet-button" onClick={() => setTreeOpen(true)}><FolderTreeIcon className="h-3.5 w-3.5" /> Skill auswählen</button>
                  </div>
                )}
          </section>
      </div>

      {status.data?.repositoryConfigured ? (
        <SkillGitBar
          repository={status.data.repository}
          result={gitResult}
          busy={gitMutation.isPending}
          onCommit={() => gitMutation.mutate()}
        />
      ) : null}

      <NewSkillDialog
        open={creating}
        busy={createMutation.isPending}
        onClose={() => setCreating(false)}
        onCreate={(input) => createMutation.mutate(input)}
      />
      <PromptDialog
        open={renaming !== null}
        title="Skill umbenennen"
        description="Ordner, alle Verweise und der Frontmatter-Name werden mit umbenannt."
        label="Neuer Name"
        initialValue={renaming?.name ?? ""}
        confirmLabel="Umbenennen"
        onConfirm={(value) => { if (renaming) renameMutation.mutate({ name: renaming.name, newName: value }); }}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Skill „${deleting?.name ?? ""}" löschen`}
        description="Der Skill-Ordner, alle Verweise in den Harness-Verzeichnissen und die README-Zeile werden entfernt. Das lässt sich nur über Git zurückholen."
        confirmLabel="Endgültig löschen"
        danger
        onConfirm={() => { if (deleting) deleteMutation.mutate(deleting.name); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
