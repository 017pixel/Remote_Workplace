import { Select as BaseSelect } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "../icons";
import { cx } from "./utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({ value, defaultValue, onValueChange, options, label, placeholder = "Auswählen", className, disabled }: {
  value?: string | null;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <BaseSelect.Root
      value={value}
      defaultValue={defaultValue}
      items={options}
      disabled={disabled}
      onValueChange={(next) => onValueChange?.(next ?? "")}
    >
      <BaseSelect.Trigger className={cx("ui-select-trigger", className)} aria-label={label}>
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon><ChevronDownIcon aria-hidden /></BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={6} className="ui-select-positioner">
          <BaseSelect.Popup className="ui-select-popup">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item key={option.value} value={option.value} disabled={option.disabled} className="ui-select-item">
                  <BaseSelect.ItemIndicator><CheckIcon aria-hidden /></BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
