import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";

export interface RadioCardOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function RadioGroup({ value, defaultValue, onValueChange, options, label }: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: RadioCardOption[];
  label: string;
}) {
  return (
    <BaseRadioGroup className="ui-radio-group" value={value} defaultValue={defaultValue} onValueChange={(next) => onValueChange?.(next)} aria-label={label}>
      {options.map((option) => (
        <label className="ui-radio-card" key={option.value}>
          <Radio.Root value={option.value} disabled={option.disabled} className="ui-radio">
            <Radio.Indicator className="ui-radio-indicator" />
          </Radio.Root>
          <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
        </label>
      ))}
    </BaseRadioGroup>
  );
}
