import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { units } from "../kitchen/domain";
import { stockInputSchema, stockStatus, type StockItem } from "./domain";
import type { usePantry } from "./usePantry";
import "./pantry.css";

type Pantry = ReturnType<typeof usePantry>;
type Editor = { id: string; revision: number; item?: StockItem };
type Edit = Parameters<Pantry["save"]>[0];
const unitLabels: Record<StockItem["unit"], string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  dl: "dl",
  l: "l",
  tsp: "tsk",
  tbsp: "msk",
  pcs: "st",
  pinch: "nypa",
};
const numberFormat = new Intl.NumberFormat("sv-SE", { maximumSignificantDigits: 9 });
const dateFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const nameOrder = new Intl.Collator("sv-SE");
const quantity = (item: Pick<StockItem, "amount" | "unit">) =>
  item.amount === null
    ? "Okänd mängd"
    : numberFormat.format(item.amount) + " " + unitLabels[item.unit];

function StockEditor({
  editor,
  pantry,
  close,
  done,
}: {
  editor: Editor;
  pantry: Pantry;
  close: () => void;
  done: (message: string) => void;
}) {
  const [name, setName] = useState(editor.item?.name ?? "");
  const [amount, setAmount] = useState(editor.item?.amount?.toString() ?? "");
  const [unit, setUnit] = useState<StockItem["unit"]>(editor.item?.unit ?? "g");
  const [confirmed, setConfirmed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  const [investigate, setInvestigate] = useState<Edit | null>(null);
  const [conflict, setConflict] = useState(false);
  const busy = !!pantry.busy;

  async function commit(item: Edit["item"]) {
    if (busy || investigate || conflict) return;
    const edit = {
      itemId: editor.id,
      expectedRevision: editor.revision,
      requestId: crypto.randomUUID(),
      item,
    };
    setNotice("");
    const result = await pantry.save(edit);
    if (result.ok) {
      done(item === null ? "Råvaran togs bort." : "Lagerposten sparades.");
    } else if (result.kind === "invalid") {
      setNotice("Lagerposten kunde inte sparas. Kontrollera mängden.");
    } else {
      setInvestigate(edit);
      setNotice(
        result.kind === "conflict"
          ? "Lagret ändrades innan uppdateringen."
          : "Sparandet kunde inte bekräftas.",
      );
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (removing) {
      void commit(null);
      return;
    }
    const parsed = stockInputSchema.safeParse({
      name,
      amount: amount === "" ? null : Number(amount),
      unit,
      confirmed,
    });
    if (!parsed.success) {
      setNotice("Ange en råvara och en giltig mängd.");
      return;
    }
    void commit(parsed.data);
  }

  async function inspectSave() {
    if (!investigate) return;
    const remote = await pantry.reload();
    if (remote === undefined) {
      setNotice("Lagret kunde inte hämtas. Ditt utkast är kvar.");
      return;
    }
    const row = remote?.items.find(({ id }) => id === editor.id);
    const expected = investigate.item;
    const matches = expected
      ? row?.name === expected.name &&
        row.amount === expected.amount &&
        row.unit === expected.unit &&
        (row.confirmedAt !== null) === expected.confirmed
      : !row;
    if (
      matches &&
      remote?.last_request_id === investigate.requestId &&
      remote.revision === editor.revision + 1
    ) {
      done(expected ? "Lagerposten var redan sparad." : "Råvaran var redan borttagen.");
    } else if ((remote?.revision ?? 0) === editor.revision) {
      setInvestigate(null);
      setNotice("Ingen ändring kunde bekräftas. Utkastet finns kvar.");
    } else {
      setInvestigate(null);
      setConflict(true);
      setNotice("Lagret har ändrats. Öppna posten igen för att redigera den senaste versionen.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="kitchen-dialog k-pantry-dialog">
        <DialogHeader>
          <DialogTitle>
            {removing ? "Ta bort råvara?" : editor.item ? "Redigera lagerpost" : "Ny lagerpost"}
          </DialogTitle>
          <DialogDescription>
            {removing ? editor.item?.name : "Mängd och enhet i skafferiet"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          {!removing && (
            <fieldset disabled={busy || !!investigate || conflict}>
              <label>
                Råvara
                <input
                  value={name}
                  maxLength={120}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="k-pantry-fields">
                <label>
                  Mängd
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    max={1000000}
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      if (event.target.value === "") setConfirmed(false);
                    }}
                  />
                </label>
                <label>
                  Enhet
                  <select
                    value={unit}
                    onChange={(event) => setUnit(event.target.value as StockItem["unit"])}
                  >
                    {units.map((value) => (
                      <option key={value} value={value}>
                        {unitLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="k-pantry-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={amount === ""}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Bekräfta mängden nu
              </label>
            </fieldset>
          )}
          {notice && <p role="status">{notice}</p>}
          <div className="k-actions">
            {editor.item && !removing && !conflict && !investigate && (
              <button
                type="button"
                className="k-secondary"
                disabled={busy}
                onClick={() => setRemoving(true)}
              >
                <Trash2 size={16} aria-hidden /> Ta bort
              </button>
            )}
            <button
              type="button"
              className="k-secondary"
              disabled={busy}
              onClick={removing && !conflict && !investigate ? () => setRemoving(false) : close}
            >
              {conflict ? "Stäng" : "Avbryt"}
            </button>
            {investigate ? (
              <button
                type="button"
                className="k-primary"
                disabled={busy}
                onClick={() => void inspectSave()}
              >
                <RefreshCw size={16} aria-hidden /> Kontrollera sparandet
              </button>
            ) : !conflict ? (
              <button
                className="k-primary"
                type="submit"
                disabled={busy || pantry.snapshot === undefined}
              >
                {removing ? <Trash2 size={16} aria-hidden /> : <Check size={16} aria-hidden />}
                {removing ? "Ta bort råvaran" : "Spara lagerpost"}
              </button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PantryPanel({
  pantry,
  now,
  online,
  onPlan,
}: {
  pantry: Pantry;
  now: number;
  online: boolean;
  onPlan: () => void;
}) {
  const [editor, setEditor] = useState<Editor>();
  const [notice, setNotice] = useState("");
  const items = pantry.snapshot?.items ?? [];
  const canEdit = online && !pantry.busy && pantry.snapshot !== undefined;
  return (
    <section className="k-pantry" aria-labelledby="pantry-title">
      <div className="k-pantry-heading">
        <h1 id="pantry-title">Skafferi</h1>
        <button
          type="button"
          className="k-secondary"
          onClick={onPlan}
          disabled={!!editor || pantry.busy === "save"}
        >
          <ArrowLeft size={16} aria-hidden /> Veckoplan
        </button>
      </div>
      <div className="k-pantry-heading">
        <h2>Hemma</h2>
        <button
          type="button"
          className="k-primary"
          disabled={!canEdit || items.length >= 300}
          onClick={() => {
            setNotice("");
            setEditor({ id: crypto.randomUUID(), revision: pantry.snapshot?.revision ?? 0 });
          }}
        >
          <Plus size={17} aria-hidden /> Lägg till råvara
        </button>
      </div>
      {!online ? (
        <p role="status">Skafferiet är inte tillgängligt offline.</p>
      ) : pantry.error ? (
        <div role="status" className="k-pantry-error">
          <p>Skafferiet kunde inte hämtas.</p>
          <button
            type="button"
            className="k-secondary"
            disabled={!!pantry.busy || !!editor}
            onClick={() => void pantry.reload()}
          >
            <RefreshCw size={16} aria-hidden /> Hämta igen
          </button>
        </div>
      ) : pantry.snapshot === undefined ? (
        <p role="status" aria-busy="true">
          Hämtar skafferiet…
        </p>
      ) : items.length === 0 ? (
        <p>Inga råvaror i skafferiet.</p>
      ) : (
        <ul className="k-pantry-stock">
          {items
            .slice()
            .sort((a, b) => nameOrder.compare(a.name, b.name) || a.id.localeCompare(b.id))
            .map((item) => {
              const status = stockStatus(item, now);
              return (
                <li key={item.id}>
                  <div className="k-pantry-info">
                    <strong>{item.name}</strong>
                    <span>{quantity(item)}</span>
                    <span>
                      {status === "unconfirmed"
                        ? "Inte bekräftad"
                        : (status === "stale" ? "Behöver bekräftas · " : "Bekräftad ") +
                          dateFormat.format(new Date(item.confirmedAt ?? 0))}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="k-icon"
                    title="Redigera"
                    aria-label={`Redigera ${item.name}`}
                    disabled={!canEdit}
                    onClick={() => {
                      setNotice("");
                      setEditor({ id: item.id, revision: pantry.snapshot?.revision ?? 0, item });
                    }}
                  >
                    <Pencil size={17} aria-hidden />
                  </button>
                </li>
              );
            })}
        </ul>
      )}
      {notice && <p role="status">{notice}</p>}
      {editor && (
        <StockEditor
          key={editor.id}
          editor={editor}
          pantry={pantry}
          close={() => setEditor(undefined)}
          done={(message) => {
            setEditor(undefined);
            setNotice(message);
          }}
        />
      )}
    </section>
  );
}
