import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="empty-state-icon flex h-14 w-14 items-center justify-center text-faint">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        <h2 className="text-base font-medium text-text">{title}</h2>
        {description ? <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
