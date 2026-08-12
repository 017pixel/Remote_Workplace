import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode } from "react";
import { CloseIcon } from "../icons";
import { Button } from "./Button";

export function Dialog({ trigger, title, description, children, open, onOpenChange }: {
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ui-dialog-backdrop" />
        <BaseDialog.Viewport className="ui-dialog-viewport">
          <BaseDialog.Popup className="ui-dialog">
            <header className="ui-dialog-header">
              <div><BaseDialog.Title className="ui-dialog-title">{title}</BaseDialog.Title>{description ? <BaseDialog.Description className="ui-dialog-description">{description}</BaseDialog.Description> : null}</div>
              <BaseDialog.Close render={<Button variant="ghost" size="icon" aria-label="Dialog schließen"><CloseIcon aria-hidden /></Button>} />
            </header>
            <div className="ui-dialog-content">{children}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
