import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ClipboardCheck, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmPantryConsumption, loadConsumptionReview, PantryError } from "./api";
import { stockStatus, suggestPantryConsumption, type StockItem } from "./domain";
import "./pantry.css";

type Review = Awaited<ReturnType<typeof loadConsumptionReview>>;
type Choice = { checked: boolean; amount: string };
const format = new Intl.NumberFormat("sv-SE", { maximumSignificantDigits: 9 });
const units: Record<StockItem["unit"], string> = {
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

function ReviewDialog({
  owner,
  sessionId,
  online,
  close,
}: {
  owner: string;
  sessionId: string;
  online: boolean;
  close: () => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const lastRevision = useRef<number | undefined>(undefined);
  const prefix = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      operation.current = null;
    };
  }, []);

  const start = useCallback(
    (kind: "read" | "save") => {
      if (!online || !navigator.onLine || operation.current || !mounted.current) return null;
      const controller = new AbortController();
      operation.current = controller;
      setBusy(kind);
      const current = () => mounted.current && operation.current === controller;
      return {
        current,
        scope: { owner, current },
        signal: controller.signal,
        finish() {
          if (!current()) return;
          operation.current = null;
          setBusy(null);
        },
      };
    },
    [online, owner],
  );

  const read = useCallback(async () => {
    const task = start("read");
    if (!task) return;
    setNotice("");
    try {
      const latest = await loadConsumptionReview(task.scope, sessionId, task.signal);
      if (!task.current()) return;
      setReview(latest);
      if (latest.receipt || lastRevision.current !== latest.pantry?.revision) setChoices({});
      lastRevision.current = latest.pantry?.revision;
      setPending(false);
    } catch {
      if (task.current()) {
        setReview(null);
        setNotice("Matlagningen och skafferiet kunde inte kontrolleras.");
      }
    } finally {
      task.finish();
    }
  }, [sessionId, start]);
  useEffect(() => {
    void read();
  }, [read]);

  const now = Date.now();
  const stock =
    review?.pantry?.items.filter(
      (item) => item.amount !== null && item.amount > 0 && stockStatus(item, now) === "fresh",
    ) ?? [];
  const suggestions = review
    ? suggestPantryConsumption(owner, review.session, review.version, review.pantry, now)
    : [];
  const estimated = new Map(suggestions.map((item) => [item.itemId, item.suggestedAmount]));
  const selected = stock.filter(({ id }) => choices[id]?.checked);
  const checkedCount = Object.values(choices).filter(({ checked }) => checked).length;
  const items = selected.map(({ id }) => ({ itemId: id, amount: Number(choices[id].amount) }));
  const valid =
    items.length > 0 &&
    items.length <= 80 &&
    items.length === checkedCount &&
    items.every(
      ({ amount }, index) =>
        Number.isFinite(amount) && amount >= 0.000000001 && amount <= (selected[index].amount ?? 0),
    );

  function choice(item: StockItem) {
    return (
      choices[item.id] ?? {
        checked: false,
        amount: estimated.get(item.id)?.toString() ?? "",
      }
    );
  }
  function row(item: StockItem) {
    const current = choice(item);
    return (
      <div key={item.id} className="k-pantry-review-row">
        <label className="k-pantry-confirm">
          <input
            type="checkbox"
            checked={current.checked}
            disabled={!current.checked && checkedCount >= 80}
            onChange={(event) =>
              setChoices((values) => ({
                ...values,
                [item.id]: {
                  ...choice(item),
                  checked: event.target.checked,
                },
              }))
            }
          />
          <span>
            <strong>{item.name}</strong>
            <small>
              {format.format(item.amount ?? 0)} {units[item.unit]} hemma
            </small>
          </span>
        </label>
        {current.checked && (
          <div>
            <label htmlFor={prefix + item.id}>Använd mängd ({units[item.unit]})</label>
            <input
              id={prefix + item.id}
              type="number"
              inputMode="decimal"
              step="any"
              min={0.000000001}
              max={item.amount ?? 0}
              required
              value={current.amount}
              onChange={(event) =>
                setChoices({ ...choices, [item.id]: { ...current, amount: event.target.value } })
              }
            />
          </div>
        )}
      </div>
    );
  }

  async function save() {
    if (!review?.pantry || review.receipt || pending || !valid) return;
    const task = start("save");
    if (!task) return;
    const intent = {
      sessionId,
      sessionRevision: review.session.revision,
      expectedRevision: review.pantry.revision,
      requestId: crypto.randomUUID(),
      items,
    };
    setNotice("");
    try {
      const saved = await confirmPantryConsumption(task.scope, intent, task.signal);
      if (!task.current()) return;
      setReview({ ...review, ...saved });
      setChoices({});
    } catch (error) {
      if (!task.current()) return;
      setPending(true);
      setNotice(
        error instanceof PantryError && error.kind === "conflict"
          ? "Lagret eller granskningen har ändrats."
          : "Förbrukningen kunde inte bekräftas. Inget skickas igen automatiskt.",
      );
    } finally {
      task.finish();
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && busy !== "save" && close()}>
      <DialogContent className="kitchen-dialog k-pantry-dialog k-pantry-review">
        <DialogHeader>
          <DialogTitle>Granska förbrukning</DialogTitle>
          <DialogDescription>
            {review ? review.version.document.title : "Skafferiet efter matlagningen"}
          </DialogDescription>
        </DialogHeader>
        {!online ? (
          <p role="status">Anslut för att kontrollera och bekräfta förbrukningen.</p>
        ) : review?.receipt ? (
          <div role="status">
            <strong>Förbrukningen är registrerad.</strong>
            <ul>
              {review.receipt.items.map((item) => (
                <li key={item.itemId}>
                  {item.name}: {format.format(item.amount)} {units[item.unit]}
                </li>
              ))}
            </ul>
          </div>
        ) : review ? (
          stock.length ? (
            <form
              id={prefix + "review"}
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={!!busy || !!pending}>
                {stock.filter(({ id }) => estimated.has(id)).map(row)}
                {stock.some(({ id }) => !estimated.has(id)) && (
                  <details open={stock.every(({ id }) => !estimated.has(id))}>
                    <summary>Andra lagerposter</summary>
                    {stock.filter(({ id }) => !estimated.has(id)).map(row)}
                  </details>
                )}
              </fieldset>
            </form>
          ) : (
            <p>Inga bekräftade mängder att dra av.</p>
          )
        ) : busy === "read" ? (
          <p aria-busy="true">Hämtar lagret…</p>
        ) : null}
        {notice && <p role="status">{notice}</p>}
        <div className="k-actions">
          <button type="button" className="k-secondary" disabled={busy === "save"} onClick={close}>
            {review?.receipt ? "Stäng" : "Avbryt"}
          </button>
          {online && !review?.receipt && (pending || (!review && notice)) ? (
            <button
              type="button"
              className="k-primary"
              disabled={!!busy}
              onClick={() => void read()}
            >
              <RefreshCw size={16} aria-hidden /> Kontrollera uppgifterna
            </button>
          ) : online && review && !review.receipt && stock.length ? (
            <button
              type="submit"
              form={prefix + "review"}
              className="k-primary"
              disabled={!valid || !!busy}
            >
              <Check size={16} aria-hidden /> Bekräfta förbrukning
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConsumptionReview({
  owner,
  sessionId,
  online,
  canReview,
}: {
  owner: string;
  sessionId: string;
  online: boolean;
  canReview: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="k-secondary"
        disabled={!online || !canReview}
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck size={18} aria-hidden /> Granska förbrukning
      </button>
      {open && (
        <ReviewDialog
          owner={owner}
          sessionId={sessionId}
          online={online}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
