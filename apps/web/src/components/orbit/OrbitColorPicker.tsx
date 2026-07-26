import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { PASTEL_NODE_COLORS, useNodeColors } from "../../stores/nodeColors";

/**
 * Farbwahl für einen Orbit-Knoten: Pastell-Vorgaben, eigene gespeicherte Farben
 * und der Farbkreis des Systems für alles dazwischen. `null` steht für die
 * automatische Farbe aus der Projekt-ID.
 */
export function OrbitColorPicker({ value, onSelect }: { value: string | null; onSelect: (color: string | null) => void }) {
  const customColors = useNodeColors((state) => state.customColors);
  const addCustomColor = useNodeColors((state) => state.addCustomColor);
  const removeCustomColor = useNodeColors((state) => state.removeCustomColor);
  // Startwert des Farbkreises: die aktuelle Farbe, sonst ein neutraler Pastellton.
  const [draft, setDraft] = useState(value ?? "#a8c7fa");

  const swatch = (color: string, label: string) => (
    <button
      key={color}
      type="button"
      role="menuitemradio"
      aria-checked={value === color}
      aria-label={label}
      title={label}
      className={`orbit-color-swatch ${value === color ? "is-active" : ""}`}
      style={{ background: color }}
      onClick={() => onSelect(color)}
    >
      {value === color ? <Check className="h-3 w-3" aria-hidden /> : null}
    </button>
  );

  return (
    <div className="orbit-color-picker" role="group" aria-label="Farbe wählen">
      <div className="orbit-color-row">
        {PASTEL_NODE_COLORS.map((color) => swatch(color, `Farbe ${color}`))}
      </div>

      {customColors.length > 0 ? (
        <>
          <p className="orbit-color-label">Eigene</p>
          <div className="orbit-color-row">
            {customColors.map((color) => (
              <span key={color} className="orbit-color-custom">
                {swatch(color, `Eigene Farbe ${color}`)}
                <button
                  type="button"
                  className="orbit-color-remove"
                  aria-label={`Eigene Farbe ${color} entfernen`}
                  onClick={() => removeCustomColor(color)}
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        </>
      ) : null}

      <div className="orbit-color-actions">
        <label className="orbit-color-wheel" title="Eigene Farbe mischen">
          <input
            type="color"
            value={draft}
            aria-label="Eigene Farbe mischen"
            onChange={(event) => setDraft(event.target.value)}
          />
          <span style={{ background: draft }} aria-hidden />
        </label>
        <button
          type="button"
          className="orbit-color-add"
          onClick={() => { addCustomColor(draft); onSelect(draft); }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Übernehmen
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={value === null}
          title="Automatische Farbe aus der Projekt-ID"
          className={`orbit-color-auto ${value === null ? "is-active" : ""}`}
          onClick={() => onSelect(null)}
        >
          Auto
        </button>
      </div>
    </div>
  );
}
