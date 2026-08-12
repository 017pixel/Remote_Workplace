import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRightIcon, MoreIcon } from "../icons";

export interface BreadcrumbItem {
  label: ReactNode;
  to?: string;
}

export function Breadcrumb({ items, compact = false, label = "Brotkrumen" }: { items: BreadcrumbItem[]; compact?: boolean; label?: string }) {
  const visible: BreadcrumbItem[] = compact && items.length > 3
    ? [items[0]!, { label: <><MoreIcon aria-hidden /><span className="sr-only">Zwischenpfad</span></> }, ...items.slice(-2)]
    : items;
  return (
    <nav className="ui-breadcrumb" aria-label={label}>
      <ol>
        {visible.map((item, index) => (
          <li key={`${index}-${String(item.to ?? item.label)}`}>
            {index > 0 ? <ChevronRightIcon className="ui-breadcrumb-separator" aria-hidden /> : null}
            {item.to && index < visible.length - 1 ? <Link to={item.to}>{item.label}</Link> : <span aria-current={index === visible.length - 1 ? "page" : undefined}>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
