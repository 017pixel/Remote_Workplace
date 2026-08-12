import { ExternalLinkIcon, FullscreenIcon, MoreIcon, RefreshIcon, RestoreIcon } from "./icons";
import { DropdownMenu } from "./ui/DropdownMenu";

interface ToolActionMenuProps {
  externalHref: string;
  isFullscreen: boolean;
  onFullscreen: () => void | Promise<void>;
  onReload: () => void;
  className?: string;
}

export function ToolActionMenu({ externalHref, isFullscreen, onFullscreen, onReload, className = "" }: ToolActionMenuProps) {
  const run = (action: () => void | Promise<void>) => {
    void Promise.resolve(action()).catch(() => undefined);
  };

  return (
    <div className={`tool-actions-menu ${className}`.trim()}>
      <DropdownMenu
        label="Werkzeugaktionen"
        trigger={<button type="button" className="icon-button tool-actions-trigger"><MoreIcon className="h-4 w-4" /></button>}
        items={[
          { id: "reload", label: "Neu laden", icon: <RefreshIcon className="h-4 w-4" />, onSelect: () => run(onReload) },
          { id: "external", label: "In neuem Tab öffnen", icon: <ExternalLinkIcon className="h-4 w-4" />, onSelect: () => { window.open(externalHref, "_blank", "noopener,noreferrer"); } },
          "separator",
          { id: "fullscreen", label: isFullscreen ? "Vollbild verlassen" : "Vollbild", icon: isFullscreen ? <RestoreIcon className="h-4 w-4" /> : <FullscreenIcon className="h-4 w-4" />, onSelect: () => run(onFullscreen) },
        ]}
      />
    </div>
  );
}
