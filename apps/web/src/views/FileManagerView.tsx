import { FileManagerPanel } from "../components/files/FileManagerPanel";
import { FileManagerSync } from "../components/files/FileManagerSync";

/**
 * Die Dateiverwaltung füllt die komplette Arbeitsfläche, wie die eingebetteten
 * Werkzeuge auch. Der Seitentitel steht bereits in der Topbar, deshalb gibt es
 * hier keine zweite Überschrift.
 */
export function FileManagerView() {
  return (
    <div className="app-surface file-manager-page">
      <FileManagerSync />
      <FileManagerPanel externalSync />
    </div>
  );
}
