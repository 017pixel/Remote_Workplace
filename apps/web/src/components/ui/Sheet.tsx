import { Drawer } from "@base-ui/react/drawer";
import type { ReactElement, ReactNode } from "react";
import { CloseIcon } from "../icons";
import { Button } from "./Button";

export function Sheet({ trigger, title, description, children, open, onOpenChange }: {
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => onOpenChange?.(next)} swipeDirection="down">
      {trigger ? <Drawer.Trigger render={trigger} /> : null}
      <Drawer.Portal>
        <Drawer.Backdrop className="ui-dialog-backdrop" />
        <Drawer.Viewport className="ui-sheet-viewport">
          <Drawer.Popup className="ui-sheet">
            <div className="ui-sheet-handle" aria-hidden />
            <header className="ui-dialog-header">
              <div><Drawer.Title className="ui-dialog-title">{title}</Drawer.Title>{description ? <Drawer.Description className="ui-dialog-description">{description}</Drawer.Description> : null}</div>
              <Drawer.Close render={<Button variant="ghost" size="icon" aria-label="Bereich schließen"><CloseIcon aria-hidden /></Button>} />
            </header>
            <Drawer.Content className="ui-dialog-content">{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
