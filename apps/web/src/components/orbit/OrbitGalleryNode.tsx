import { useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, File, FolderUp, Images, Pencil, Plus, RefreshCw, Search, Trash2, Upload, FolderOpen, Folder } from "lucide-react";
import type { OrbitAsset, GalleryFolder } from "@workbench/contracts";
import { apiClient } from "../../lib/apiClient";
import { ContentDialog } from "../ModalDialog";

export type GalleryVariant = "media" | "files";

interface VariantConfig {
  label: string;
  kicker: string;
  ariaLabel: string;
  queryKey: readonly string[];
  foldersQueryKey: readonly string[];
  list: (cursor?: string, signal?: AbortSignal, folderId?: string | null) => Promise<{ items: OrbitAsset[]; nextCursor: string | null }>;
  upload: (file: File, folderId?: string | null) => Promise<OrbitAsset>;
  url: (id: string) => string;
  update: (id: string, body: { filename?: string; folderId?: string | null }) => Promise<OrbitAsset>;
  delete: (id: string) => Promise<unknown>;
  listFolders: (signal?: AbortSignal) => Promise<{ folders: GalleryFolder[] }>;
  createFolder: (name: string) => Promise<{ folder: GalleryFolder } | undefined>;
  updateFolder: (id: string, name: string) => Promise<{ folder: GalleryFolder } | undefined>;
  deleteFolder: (id: string) => Promise<unknown>;
  countNoun: string;
  emptyTitle: string;
  emptyHint: string;
  Icon: typeof Images;
}

const VARIANTS: Record<GalleryVariant, VariantConfig> = {
  media: {
    label: "Mediengalerie",
    kicker: "Orbit-Archiv",
    ariaLabel: "Mediengalerie",
    queryKey: ["orbit", "assets"],
    foldersQueryKey: ["orbit", "assets", "folders"],
    list: async (cursor, signal, folderId) => {
      const page = await apiClient.listOrbitAssets(cursor, signal, folderId);
      return { items: page.assets, nextCursor: page.nextCursor };
    },
    upload: (file, folderId) => apiClient.uploadOrbitAsset(file, folderId),
    url: (id) => apiClient.orbitAssetUrl(id),
    update: (id, body) => apiClient.updateOrbitAsset(id, body).then((r) => r!.asset),
    delete: (id) => apiClient.deleteOrbitAsset(id),
    listFolders: (signal) => apiClient.listOrbitAssetFolders(signal),
    createFolder: (name) => apiClient.createOrbitAssetFolder(name),
    updateFolder: (id, name) => apiClient.updateOrbitAssetFolder(id, name),
    deleteFolder: (id) => apiClient.deleteOrbitAssetFolder(id),
    countNoun: "Dateien",
    emptyTitle: "Dein Bildarchiv ist bereit",
    emptyHint: "Bilder, die du im Canvas einfügst, erscheinen hier automatisch.",
    Icon: Images,
  },
  files: {
    label: "Dateigalerie",
    kicker: "Datei-Speicher",
    ariaLabel: "Dateigalerie",
    queryKey: ["gallery", "files"],
    foldersQueryKey: ["gallery", "files", "folders"],
    list: async (cursor, signal, folderId) => {
      const page = await apiClient.listGalleryFiles(cursor, signal, folderId);
      return { items: page.files, nextCursor: page.nextCursor };
    },
    upload: (file, folderId) => apiClient.uploadGalleryFile(file, folderId),
    url: (id) => apiClient.galleryFileUrl(id),
    update: (id, body) => apiClient.updateGalleryFile(id, body).then((r) => r!.file),
    delete: (id) => apiClient.deleteGalleryFile(id),
    listFolders: (signal) => apiClient.listGalleryFolders(signal),
    createFolder: (name) => apiClient.createGalleryFolder(name),
    updateFolder: (id, name) => apiClient.updateGalleryFolder(id, name),
    deleteFolder: (id) => apiClient.deleteGalleryFolder(id),
    countNoun: "Dateien",
    emptyTitle: "Deine Dateigalerie ist bereit",
    emptyHint: "Lade Dateien über Hochladen hoch oder ziehe sie auf den Canvas.",
    Icon: FolderUp,
  },
};

function formatBytes(bytes: number) {
  return new Intl.NumberFormat("de-DE", { style: "unit", unit: "byte", unitDisplay: "narrow", notation: "compact" }).format(bytes);
}

function AssetCard({ asset, url, onStatus, onDelete, onRename, onMove, folders }: { asset: OrbitAsset; url: string; onStatus: (message: string) => void; onDelete: (asset: OrbitAsset) => void; onRename: (asset: OrbitAsset) => void; onMove: (asset: OrbitAsset, folderId: string | null) => void; folders: GalleryFolder[] }) {
  const [shape, setShape] = useState<"wide" | "tall" | "square">("square");
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const image = asset.mimeType.startsWith("image/");
  const copy = async () => {
    if (!image || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      onStatus("Der Browser unterstützt das Kopieren von Bildern nicht.");
      return;
    }
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Download fehlgeschlagen");
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || asset.mimeType]: blob })]);
      onStatus(`${asset.filename} wurde in die Zwischenablage kopiert.`);
    } catch {
      onStatus("Das Bild konnte nicht in die Zwischenablage kopiert werden.");
    }
  };
  return <article className={`orbit-gallery-card ${image ? `is-image is-${shape}` : "is-file"}`}>
    {image ? <img src={url} alt={asset.filename} onLoad={(event) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      setShape(naturalWidth > naturalHeight * 1.35 ? "wide" : naturalHeight > naturalWidth * 1.35 ? "tall" : "square");
    }} /> : <div className="orbit-gallery-file-icon"><File className="h-7 w-7" /></div>}
    <div className="orbit-gallery-card-meta"><strong title={asset.filename}>{asset.filename}</strong><small>{asset.mimeType} · {formatBytes(asset.bytes)}</small></div>
    <div className="orbit-gallery-card-actions">
      {image ? <button type="button" onClick={() => void copy()} aria-label={`${asset.filename} kopieren`} title="Bild kopieren"><Copy className="h-3.5 w-3.5" /></button> : null}
      <a href={url} download={asset.filename} aria-label={`${asset.filename} herunterladen`} title="Herunterladen"><Download className="h-3.5 w-3.5" /></a>
      <a href={url} target="_blank" rel="noreferrer" aria-label={`${asset.filename} öffnen`} title="Original öffnen"><ExternalLink className="h-3.5 w-3.5" /></a>
      <button type="button" onClick={() => onRename(asset)} aria-label={`${asset.filename} umbenennen`} title="Umbenennen"><Pencil className="h-3.5 w-3.5" /></button>
      {/* Als Dialog statt als Aufklapp-Menü in der Karte: Das Menü klappte nach oben
          aus der Karte heraus und wurde vom Karten- und Gitter-Clipping verschluckt —
          es war nicht sichtbar und nicht klickbar. */}
      <button type="button" onClick={() => setShowMoveMenu(true)} aria-label="In Ordner verschieben" title="Verschieben"><FolderOpen className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => onDelete(asset)} aria-label={`${asset.filename} löschen`} title="Löschen" className="is-danger"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
    <ContentDialog
      open={showMoveMenu}
      title="In Ordner verschieben"
      description={asset.filename}
      onClose={() => setShowMoveMenu(false)}
    >
      <div className="gallery-move-options">
        <button type="button" onClick={() => { onMove(asset, null); setShowMoveMenu(false); }} className={asset.folderId === null ? "is-active" : ""}>
          <FolderOpen className="h-4 w-4" /> Ohne Ordner
        </button>
        {folders.map((folder) => (
          <button key={folder.id} type="button" onClick={() => { onMove(asset, folder.id); setShowMoveMenu(false); }} className={asset.folderId === folder.id ? "is-active" : ""}>
            <Folder className="h-4 w-4" /> {folder.name}
          </button>
        ))}
        {folders.length === 0 ? <p className="gallery-move-empty">Es gibt noch keine Ordner. Lege oben in der Leiste einen an.</p> : null}
      </div>
    </ContentDialog>
  </article>;
}

export function OrbitGalleryNode({ variant = "media" }: { variant?: GalleryVariant } = {}) {
  const config = VARIANTS[variant];
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<OrbitAsset | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OrbitAsset | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<GalleryFolder | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const archive = useInfiniteQuery({
    queryKey: [...config.queryKey, selectedFolderId ?? "root"],
    queryFn: ({ pageParam, signal }) => config.list(pageParam, signal, selectedFolderId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const folders = useQuery({
    queryKey: config.foldersQueryKey,
    queryFn: ({ signal }) => config.listFolders(signal),
  });

  const assets = useMemo(() => archive.data?.pages.flatMap((page) => page.items) ?? [], [archive.data]);
  const normalized = query.trim().toLocaleLowerCase("de");
  const visible = normalized ? assets.filter((asset) => `${asset.filename} ${asset.mimeType}`.toLocaleLowerCase("de").includes(normalized)) : assets;
  const errorMessage = archive.error instanceof Error ? archive.error.message : "Die Verbindung konnte nicht hergestellt werden.";
  const Icon = config.Icon;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        await config.upload(file, selectedFolderId);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    await queryClient.invalidateQueries({ queryKey: config.queryKey });
    setStatus(failed ? `${ok} hochgeladen, ${failed} fehlgeschlagen.` : `${ok} ${ok === 1 ? "Datei" : "Dateien"} hochgeladen.`);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await config.update(renameTarget.id, { filename: renameValue.trim() });
      await queryClient.invalidateQueries({ queryKey: config.queryKey });
      setStatus(`${renameTarget.filename} wurde umbenannt.`);
    } catch {
      setStatus("Umbenennen fehlgeschlagen.");
    }
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await config.delete(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: config.queryKey });
      setStatus(`${deleteTarget.filename} wurde gelöscht.`);
    } catch {
      setStatus("Löschen fehlgeschlagen.");
    }
    setDeleteTarget(null);
  };

  const handleMove = async (asset: OrbitAsset, folderId: string | null) => {
    try {
      await config.update(asset.id, { folderId });
      await queryClient.invalidateQueries({ queryKey: config.queryKey });
      await queryClient.invalidateQueries({ queryKey: config.foldersQueryKey });
      setStatus(`${asset.filename} wurde verschoben.`);
    } catch {
      setStatus("Verschieben fehlgeschlagen.");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await config.createFolder(newFolderName.trim());
      await queryClient.invalidateQueries({ queryKey: config.foldersQueryKey });
      setStatus("Ordner wurde erstellt.");
    } catch {
      setStatus("Ordner konnte nicht erstellt werden.");
    }
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const handleUpdateFolder = async () => {
    if (!editingFolder || !editingFolderName.trim()) return;
    try {
      await config.updateFolder(editingFolder.id, editingFolderName.trim());
      await queryClient.invalidateQueries({ queryKey: config.foldersQueryKey });
      setStatus("Ordner wurde umbenannt.");
    } catch {
      setStatus("Ordner konnte nicht umbenannt werden.");
    }
    setEditingFolder(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = async (folder: GalleryFolder) => {
    try {
      await config.deleteFolder(folder.id);
      await queryClient.invalidateQueries({ queryKey: config.foldersQueryKey });
      if (selectedFolderId === folder.id) setSelectedFolderId(null);
      setStatus("Ordner wurde gelöscht.");
    } catch {
      setStatus("Ordner konnte nicht gelöscht werden.");
    }
  };

  const folderList = folders.data?.folders ?? [];
  const totalFiles = assets.length;

  return <section className={`orbit-gallery orbit-gallery--${variant} nodrag nowheel`} aria-label={config.ariaLabel}>
    <header className="orbit-gallery-head">
      <div className="orbit-gallery-head-info">
        <span className="orbit-gallery-head-kicker">{config.kicker}</span>
        <h2 className="orbit-gallery-head-title">{config.label}</h2>
        <span className="orbit-gallery-head-count">{totalFiles} {config.countNoun}{selectedFolderId ? ` in diesem Ordner` : ""}</span>
      </div>
      <div className="orbit-gallery-head-actions">
        <button type="button" className="orbit-gallery-upload" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />{uploading ? "Wird geladen…" : "Hochladen"}
        </button>
      </div>
    </header>
    <input ref={inputRef} type="file" multiple hidden onChange={(event) => { void handleFiles(event.target.files); event.target.value = ""; }} />
    <div className="orbit-gallery-toolbar">
      <div className="orbit-gallery-folders">
        <button type="button" className={`orbit-gallery-folder${selectedFolderId === null ? " is-active" : ""}`} onClick={() => setSelectedFolderId(null)}>
          <Folder className="h-3.5 w-3.5" /><span>Alle</span>
        </button>
        {folderList.map((folder) => <div key={folder.id} className="orbit-gallery-folder-wrapper">
          <button type="button" className={`orbit-gallery-folder${selectedFolderId === folder.id ? " is-active" : ""}`} onClick={() => setSelectedFolderId(folder.id)}>
            <FolderOpen className="h-3.5 w-3.5" /><span>{folder.name}</span><span className="orbit-gallery-folder-count">{folder.fileCount}</span>
          </button>
          <button type="button" className="orbit-gallery-folder-rename" onClick={() => { setEditingFolder(folder); setEditingFolderName(folder.name); }} title="Ordner umbenennen"><Pencil className="h-3 w-3" /></button>
          <button type="button" className="orbit-gallery-folder-delete" onClick={() => void handleDeleteFolder(folder)} title="Ordner löschen"><Trash2 className="h-3 w-3" /></button>
        </div>)}
        {showNewFolder ? <div className="orbit-gallery-folder-new">
          <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ordnername" autoFocus onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder(); if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); } }} />
          <button type="button" onClick={() => void handleCreateFolder()}><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>×</button>
        </div> : <button type="button" className="orbit-gallery-folder-add" onClick={() => setShowNewFolder(true)}><Plus className="h-3.5 w-3.5" /><span>Ordner</span></button>}
      </div>
      <label className="orbit-gallery-search"><Search className="h-3.5 w-3.5" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen…" aria-label="Galerie durchsuchen" /></label>
    </div>
    {editingFolder ? <div className="orbit-gallery-folder-edit">
      <span>Ordner umbenennen:</span>
      <input type="text" value={editingFolderName} onChange={(e) => setEditingFolderName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void handleUpdateFolder(); if (e.key === "Escape") { setEditingFolder(null); setEditingFolderName(""); } }} />
      <button type="button" onClick={() => void handleUpdateFolder()}>OK</button>
      <button type="button" onClick={() => { setEditingFolder(null); setEditingFolderName(""); }}>×</button>
    </div> : null}
    <div className="orbit-gallery-grid">
      {archive.isLoading ? Array.from({ length: 8 }, (_, index) => <span className="orbit-gallery-skeleton" key={index} />) : null}
      {visible.map((asset) => <AssetCard key={asset.id} asset={asset} url={config.url(asset.id)} onStatus={setStatus} onDelete={setDeleteTarget} onRename={(a) => { setRenameTarget(a); setRenameValue(a.filename); }} onMove={handleMove} folders={folderList} />)}
      {!archive.isLoading && !archive.isError && visible.length === 0 ? <div className="orbit-gallery-empty">
        <div className="orbit-gallery-empty-icon"><Icon className="h-10 w-10" /></div>
        <strong>{query ? "Kein Treffer" : config.emptyTitle}</strong>
        <span>{query ? "Versuche einen anderen Suchbegriff." : config.emptyHint}</span>
        {!query ? <div className="orbit-gallery-empty-actions">
          <button type="button" className="orbit-gallery-empty-action" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" />{variant === "media" ? "Bilder hochladen" : "Dateien hochladen"}</button>
          {folderList.length === 0 ? <button type="button" className="orbit-gallery-empty-action is-ghost" onClick={() => setShowNewFolder(true)}><Plus className="h-4 w-4" />Ordner anlegen</button> : null}
        </div> : null}
        {!query ? <span className="orbit-gallery-empty-drop"><FolderUp className="h-3.5 w-3.5" />Oder Dateien per Drag &amp; Drop hierher ziehen</span> : null}
      </div> : null}
      {archive.isError ? <div className="orbit-gallery-empty is-error">
        <div className="orbit-gallery-empty-icon"><RefreshCw className="h-10 w-10" /></div>
        <strong>Fehler beim Laden</strong>
        <span>{errorMessage}</span>
        <button type="button" onClick={() => void archive.refetch()}>Erneut versuchen</button>
      </div> : null}
    </div>
    {archive.hasNextPage ? <button type="button" className="orbit-gallery-more" disabled={archive.isFetchingNextPage} onClick={() => void archive.fetchNextPage()}>{archive.isFetchingNextPage ? "Wird geladen…" : "Weitere laden"}</button> : null}
    {status ? <p className="orbit-gallery-status" role="status">{status}</p> : null}
    {renameTarget ? <div className="orbit-gallery-dialog-backdrop" onClick={() => { setRenameTarget(null); setRenameValue(""); }}>
      <div className="orbit-gallery-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Umbenennen</h3>
        <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); if (e.key === "Escape") { setRenameTarget(null); setRenameValue(""); } }} />
        <div className="orbit-gallery-dialog-actions">
          <button type="button" onClick={() => { setRenameTarget(null); setRenameValue(""); }}>Abbrechen</button>
          <button type="button" onClick={() => void handleRename()}>Speichern</button>
        </div>
      </div>
    </div> : null}
    {deleteTarget ? <div className="orbit-gallery-dialog-backdrop" onClick={() => setDeleteTarget(null)}>
      <div className="orbit-gallery-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Löschen bestätigen</h3>
        <p>„{deleteTarget.filename}" wird unwiderruflich gelöscht.</p>
        <div className="orbit-gallery-dialog-actions">
          <button type="button" onClick={() => setDeleteTarget(null)}>Abbrechen</button>
          <button type="button" className="is-danger" onClick={() => void handleDelete()}>Löschen</button>
        </div>
      </div>
    </div> : null}
  </section>;
}
