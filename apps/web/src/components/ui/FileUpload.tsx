import { useRef, useState, type DragEvent } from "react";
import { CloseIcon, UploadIcon } from "../icons";
import { Button } from "./Button";

export function FileUpload({ files = [], accept, multiple = true, disabled, onFiles, onRemove, label = "Dateien auswählen" }: {
  files?: File[];
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRemove?: (file: File) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const add = (list: FileList | null) => { if (list?.length) onFiles([...list]); };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); if (!disabled) add(event.dataTransfer.files); };
  return <div className="ui-file-upload"><div className={`ui-dropzone ${dragging ? "is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}><UploadIcon aria-hidden /><strong>Dateien hier ablegen</strong><span>oder über den Systemdialog auswählen</span><Button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>{label}</Button><input ref={inputRef} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={(event) => add(event.target.files)} /></div>{files.length ? <ul className="ui-upload-list">{files.map((file) => <li key={`${file.name}-${file.size}`}><span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span>{onRemove ? <Button variant="ghost" size="icon" onClick={() => onRemove(file)} aria-label={`${file.name} entfernen`}><CloseIcon aria-hidden /></Button> : null}</li>)}</ul> : null}</div>;
}
