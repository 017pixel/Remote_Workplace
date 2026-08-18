import { useEffect, useRef, useState } from "react";
import { CloseIcon, EinstellungenIcon } from "../icons";
import { useUsagePreferences, type UsagePreferences, type UsagePreset } from "../../stores/usagePreferences";

/**
 * Einstellungen-Panel für die Nutzung-Ansicht. Öffnet als Popover über einem
 * dezenten Zahnrad-Button; Änderungen wirken sofort und werden lokal
 * persistiert. Kein "Speichern" nötig.
 */

const presets: Array<{ id: Exclude<UsagePreset, "custom">; label: string; description: string }> = [
  { id: "compact", label: "Kompakt", description: "Nur die Account-Liste mit den wichtigsten Limits" },
  { id: "standard", label: "Standard", description: "Statuszeile und einfache Account-Liste" },
  { id: "analysis", label: "Analyse", description: "Zusätzliche Kennzahlen, Provider und Prognosen" },
];

const sections: Array<{ key: keyof UsagePreferences; label: string }> = [
  { key: "showUsageKpis", label: "Token-KPIs" },
  { key: "showLimitSummary", label: "Limit-Statuszeile" },
  { key: "showAccountOverview", label: "Account-Liste" },
  { key: "showDetailedProviderCards", label: "Limitdetails (Provider-Karten)" },
  { key: "showForecasts", label: "Limitprognosen" },
  { key: "showResetCredits", label: "Reset-Guthaben" },
];

const accountOptions: Array<{ key: keyof UsagePreferences; label: string }> = [
  { key: "showProvider", label: "Provider anzeigen" },
  { key: "showPlan", label: "Plan anzeigen" },
  { key: "showEmail", label: "E-Mail anzeigen" },
  { key: "showActiveBadge", label: "Aktiv-Badge" },
  { key: "showDataStatus", label: "Datenstatus" },
];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="uvs-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="uvs-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function UsageViewSettings({ prefs }: { prefs: UsagePreferences }) {
  const store = useUsagePreferences();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
    };
  }, [open]);

  return (
    <div className="uvs" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="uvs-trigger"
        aria-label="Ansichtseinstellungen"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <EinstellungenIcon className="h-4 w-4" />
        <span>Ansicht</span>
      </button>

      {open ? (<><div className="uvs-backdrop" onPointerDown={() => setOpen(false)} />
        <div className="uvs-panel" role="dialog" aria-modal="true" aria-label="Ansichtseinstellungen">
          <header className="uvs-head"><strong>Ansicht</strong><button type="button" className="icon-button" aria-label="Ansicht schließen" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><CloseIcon className="h-4 w-4" /></button></header>
          <Section title="Preset">
            <div className="uvs-presets">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={prefs.preset === preset.id ? "is-active" : ""}
                  aria-pressed={prefs.preset === preset.id}
                  onClick={() => store.applyPreset(preset.id)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Bereiche">
            {sections.map((section) => (
              <Toggle key={section.key} label={section.label} checked={Boolean(prefs[section.key])} onChange={(value) => store.set({ [section.key]: value })} />
            ))}
          </Section>

          <Section title="Accounts">
            {accountOptions.map((option) => (
              <Toggle key={option.key} label={option.label} checked={Boolean(prefs[option.key])} onChange={(value) => store.set({ [option.key]: value })} />
            ))}
            <div className="uvs-row">
              <span>Warnschwelle</span>
              <select value={prefs.warningThreshold} onChange={(event) => store.set({ warningThreshold: Number(event.target.value) as UsagePreferences["warningThreshold"] })}>
                <option value={10}>10 %</option>
                <option value={20}>20 %</option>
                <option value={30}>30 %</option>
              </select>
            </div>
            <Toggle label="Nach Provider gruppieren" checked={prefs.groupByProvider} onChange={(value) => store.set({ groupByProvider: value })} />
          </Section>

          <Section title="Details">
            <div className="uvs-reset">
              <button type="button" onClick={() => store.resetAll()}>Standard wiederherstellen</button>
            </div>
          </Section>
        </div></>
      ) : null}
    </div>
  );
}
