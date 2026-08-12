import { Menu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";
import { ChevronRightIcon } from "../icons";
import { cx } from "./utils";

export interface DropdownMenuItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function DropdownMenu({
  trigger,
  items,
  label = "Aktionen",
  align = "end",
  className,
}: {
  trigger: ReactElement;
  items: Array<DropdownMenuItem | "separator">;
  label?: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} aria-label={label} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align={align} className="ui-menu-positioner">
          <Menu.Popup className={cx("ui-menu", className)}>
            {items.map((item, index) => item === "separator" ? (
              <Menu.Separator key={`separator-${index}`} className="ui-menu-separator" />
            ) : (
              <Menu.Item
                key={item.id}
                className={cx("ui-menu-item", item.destructive && "is-destructive")}
                disabled={item.disabled}
                onClick={item.onSelect}
              >
                {item.icon ? <span className="ui-menu-icon" aria-hidden>{item.icon}</span> : null}
                <span>{item.label}</span>
                {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function DropdownSubmenuChevron() {
  return <ChevronRightIcon className="ui-menu-chevron" aria-hidden />;
}
