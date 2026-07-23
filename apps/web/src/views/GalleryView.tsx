import { useState } from "react";
import { FolderUp, Images } from "lucide-react";
import { OrbitGalleryNode, type GalleryVariant } from "../components/orbit/OrbitGalleryNode";

const tabs: Array<{ id: GalleryVariant; label: string; description: string; icon: typeof Images }> = [
  { id: "media", label: "Mediengalerie", description: "Bilder und Screenshots aus dem Orbit-Archiv.", icon: Images },
  { id: "files", label: "Dateigalerie", description: "Beliebige Dateien auf den Server laden und wieder herunterladen.", icon: FolderUp },
];

export function GalleryView() {
  const [active, setActive] = useState<GalleryVariant>("media");
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0]!;
  return (
    <div className="page-scroll">
      <div className="page-frame gallery-page">
        <div className="page-heading">
          <h1>Galerie</h1>
          <p>Medien und Dateien zentral verwalten – hochladen vom PC, Mac oder Handy und wieder herunterladen.</p>
        </div>
        <div className="gallery-tabs" role="tablist" aria-label="Galerie-Bereich wählen">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active === tab.id}
                className={`gallery-tab${active === tab.id ? " is-active" : ""}`}
                onClick={() => setActive(tab.id)}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <p className="gallery-tab-hint">{current.description}</p>
        <div className="gallery-page-surface">
          <OrbitGalleryNode key={active} variant={active} />
        </div>
      </div>
    </div>
  );
}
