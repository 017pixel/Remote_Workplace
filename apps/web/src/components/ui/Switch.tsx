import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cx } from "./utils";

export function Switch({ checked, defaultChecked, onCheckedChange, label, description, disabled, className }: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("ui-switch-field", className)}>
      <span className="ui-switch-copy" aria-hidden="true"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <BaseSwitch.Root checked={checked} defaultChecked={defaultChecked} onCheckedChange={(next) => onCheckedChange?.(next)} disabled={disabled} className="ui-switch" aria-label={label} {...(description ? { "aria-description": description } : {})}>
        <BaseSwitch.Thumb className="ui-switch-thumb" />
      </BaseSwitch.Root>
    </label>
  );
}
