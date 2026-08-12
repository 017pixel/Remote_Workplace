import type { ReactNode } from "react";
import { CheckIcon, CloseIcon, ErrorIcon, InfoIcon, WarningIcon } from "../icons";
import { Button } from "./Button";
import { cx } from "./utils";

export type NotificationTone = "info" | "success" | "warning" | "error" | "update";

const icons = { info: InfoIcon, success: CheckIcon, warning: WarningIcon, error: ErrorIcon, update: InfoIcon };

export function Notification({ tone = "info", title, children, action, onClose, role }: {
  tone?: NotificationTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  role?: "status" | "alert";
}) {
  const Icon = icons[tone];
  return (
    <div className={cx("ui-notification", `is-${tone}`)} role={role ?? (tone === "error" ? "alert" : "status")}>
      <Icon className="ui-notification-icon" aria-hidden />
      <div className="ui-notification-copy"><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>
      {action ? <div className="ui-notification-action">{action}</div> : null}
      {onClose ? <Button variant="ghost" size="icon" onClick={onClose} aria-label="Hinweis schließen"><CloseIcon aria-hidden /></Button> : null}
    </div>
  );
}
