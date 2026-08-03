import { useEffect, useState } from "react";
import { ModalFrame } from "../ModalDialog";
import { isValidSkillName } from "../../lib/skillEditor";

interface NewSkillDialogProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; description: string; license?: string }) => void;
}

export function NewSkillDialog({ open, busy, onClose, onCreate }: NewSkillDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setLicense("");
  }, [open]);

  const nameTouched = name.trim().length > 0;
  const nameValid = isValidSkillName(name);
  const valid = nameValid && description.trim().length > 0;

  return (
    <ModalFrame
      open={open}
      title="Neuen Skill anlegen"
      description="Der Skill entsteht im Skills-Repository und wird an alle angebundenen Harnesses verteilt."
      onClose={onClose}
    >
      {(requestClose) => (
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || busy) return;
            onCreate({ name: name.trim(), description: description.trim(), ...(license.trim() ? { license: license.trim() } : {}) });
            requestClose();
          }}
        >
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mein-neuer-skill"
              maxLength={64}
              autoFocus
              aria-invalid={nameTouched && !nameValid}
            />
          </label>
          <p className={`skill-dialog-hint ${nameTouched && !nameValid ? "is-bad" : ""}`}>
            Kleinbuchstaben, Ziffern und Bindestriche. Der Name wird zum Ordnernamen.
          </p>
          <label>
            Beschreibung
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Wofür ist dieser Skill da und wann soll er greifen?"
              maxLength={1_024}
            />
          </label>
          <p className="skill-dialog-hint">Pflichtfeld — ohne Beschreibung lädt kein Agent den Skill.</p>
          <label>
            Lizenz (optional)
            <input value={license} onChange={(event) => setLicense(event.target.value)} placeholder="MIT" maxLength={120} />
          </label>
          <div className="modal-actions">
            <button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button>
            <button type="submit" className="quiet-button-primary" disabled={!valid || busy}>Anlegen</button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
