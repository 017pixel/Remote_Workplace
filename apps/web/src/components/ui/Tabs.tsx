import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { cx } from "./utils";

export interface TabDefinition {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export function Tabs({ value, defaultValue, onValueChange, tabs, label, variant = "underline", className }: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  tabs: TabDefinition[];
  label: string;
  variant?: "underline" | "segment";
  className?: string;
}) {
  return (
    <BaseTabs.Root value={value} defaultValue={defaultValue ?? tabs[0]?.value} onValueChange={(next) => onValueChange?.(next)} className={cx("ui-tabs", `is-${variant}`, className)}>
      <BaseTabs.List className="ui-tabs-list" aria-label={label}>
        {tabs.map((tab) => <BaseTabs.Tab key={tab.value} value={tab.value} disabled={tab.disabled} className="ui-tab">{tab.label}</BaseTabs.Tab>)}
        <BaseTabs.Indicator className="ui-tabs-indicator" />
      </BaseTabs.List>
      {tabs.map((tab) => <BaseTabs.Panel key={tab.value} value={tab.value} className="ui-tab-panel">{tab.content}</BaseTabs.Panel>)}
    </BaseTabs.Root>
  );
}

export const SegmentedControl = (props: Omit<Parameters<typeof Tabs>[0], "variant">) => <Tabs {...props} variant="segment" />;
