import { Check, X } from "lucide-react";
import type { Household } from "./domain";

export type HouseholdNameDraft = { householdId: string; name: string; revision: number };
export function HouseholdNameForm({
  household,
  busy,
  draft,
  onDraft,
  onSave,
}: {
  household: Household;
  busy: boolean;
  draft: HouseholdNameDraft | null;
  onDraft: (draft: HouseholdNameDraft | null) => void;
  onSave: (draft: HouseholdNameDraft, saved: () => void) => void;
}) {
  const changed = !!draft && draft.revision !== household.revision;
  return (
    <form
      className="meal-household-name"
      aria-label="Ändra hushållets namn"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && draft && !changed) onSave({ ...draft }, () => onDraft(null));
      }}
    >
      <label>
        Hushållets namn
        <input
          name="groupName"
          maxLength={80}
          required
          disabled={busy}
          value={draft?.name ?? household.name}
          onChange={(e) =>
            onDraft({
              householdId: household.id,
              name: e.target.value,
              revision: draft?.revision ?? household.revision,
            })
          }
        />
      </label>
      {changed && !busy && (
        <p role="status">
          Hushållet har ändrats sedan du började skriva. Ditt namnförslag finns kvar. Avbryt
          namnändringen för att läsa det aktuella namnet.
        </p>
      )}
      <div className="k-actions">
        <button className="k-text" disabled={busy || !draft || changed} type="submit">
          <Check size={18} />
          Spara hushållets namn
        </button>
        {draft && (
          <button className="k-text" disabled={busy} type="button" onClick={() => onDraft(null)}>
            <X size={18} />
            Avbryt namnändring
          </button>
        )}
      </div>
    </form>
  );
}
