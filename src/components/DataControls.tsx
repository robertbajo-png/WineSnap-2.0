import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, ShieldCheck, Loader2, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completePrivacyExport } from "@/lib/privacyExport";
import { invokePrivacy } from "@/lib/privacyTransport";
import {
  invokePrivacyAction,
  privacyControlsEnabled,
  type PrivacyAction,
} from "@/lib/privacyControls";
import { collectOwnData } from "@/lib/dataExport";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { toast } from "sonner";
export function DataControls() {
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<PrivacyAction | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionRunning = useRef(false);
  const sv = lang === "sv";
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const exportData = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const id = user.id;
      let result;
      if (privacyControlsEnabled) {
        const { data: exportData, error: exportError } = await invokePrivacy("privacy-export");
        if (exportError) throw exportError;
        result = await completePrivacyExport(
          exportData,
          id,
          import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL,
          (url) => fetch(url, { cache: "no-store", credentials: "omit", redirect: "error" }),
          () => owner.current === id,
        );
      } else {
        // Keep the existing export until the backend rollout is verified.
        result = await collectOwnData(
          id,
          (table, uid, from, to) =>
            supabase
              .from(table)
              .select("*")
              .filter(table === "profiles" ? "id" : "user_id", "eq", uid)
              .order(table === "taste_profile" ? "user_id" : "id")
              .range(from, to),
          () => owner.current === id,
        );
        result = { ...result, account: { id, email: user.email, created_at: user.created_at } };
      }
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== id) throw new Error("Account changed");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `winesnap-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(
        sv
          ? "Exporten kunde inte slutföras. Kontakta Boleo AI för registerutdrag."
          : "Export could not finish. Contact Boleo AI for an access request.",
      );
    } finally {
      setBusy(false);
    }
  };
  const openAction = (next: PrivacyAction) => {
    setConfirmed(false);
    setActionError(null);
    setAction(next);
  };
  const performAction = async () => {
    if (!user || !action || !confirmed || busy || actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true);
    setActionError(null);
    const id = user.id;
    try {
      const result = await invokePrivacyAction(action, id);
      if (owner.current !== id) throw new Error("Account changed");
      if (action === "delete_account") {
        const { data: current } = await supabase.auth.getSession();
        if (current.session && current.session.user.id !== id) throw new Error("Account changed");
        toast.success(
          result.complete
            ? sv
              ? "Kontot är raderat."
              : "Account deleted."
            : sv
              ? "Raderingen är begärd och fortsätter i bakgrunden."
              : "Erasure requested; processing continues in the background.",
        );
        if (current.session) await supabase.auth.signOut({ scope: "local" });
      } else {
        if (!result.complete) throw new Error("Reset incomplete");
        toast.success(
          sv
            ? "Ditt inlärda smakminne är nollställt."
            : "Your learned taste memory has been reset.",
        );
      }
      setAction(null);
    } catch (error) {
      setActionError(
        error instanceof Error && error.message === "reauthentication_required"
          ? sv
            ? "Logga ut och in igen innan du bekräftar åtgärden."
            : "Sign out and sign in again before confirming."
          : sv
            ? "Åtgärden kunde inte bekräftas. Försök igen eller kontakta Boleo AI."
            : "The action could not be confirmed. Retry or contact Boleo AI.",
      );
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="mt-6 border-t border-white/10 pt-4">
      <h2 className="font-display text-lg text-gold">
        {lang === "sv" ? "Dina data" : "Your data"}
      </h2>
      <Link to="/privacy" className="flex min-h-12 items-center gap-3 text-base">
        <ShieldCheck className="h-5 w-5 text-gold" />
        {lang === "sv" ? "Integritet och kontakt" : "Privacy and contact"}
      </Link>
      {user && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={exportData}
            className="flex min-h-12 items-center gap-3 text-base disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5 text-gold" />
            )}
            {lang === "sv" ? "Exportera mina uppgifter" : "Export my data"}
          </button>
          {privacyControlsEnabled && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => openAction("reset_memory")}
                className="flex min-h-12 items-center gap-3 text-base disabled:opacity-50"
              >
                <RotateCcw className="h-5 w-5 text-gold" />
                {sv ? "Nollställ smakminnet" : "Reset taste memory"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => openAction("delete_account")}
                className="flex min-h-12 items-center gap-3 text-base text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" />
                {sv ? "Radera mitt konto" : "Delete my account"}
              </button>
            </>
          )}
        </>
      )}
      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !actionRunning.current) setAction(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[calc(100svh-2rem)] overflow-y-auto rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === "delete_account"
                ? sv
                  ? "Radera ditt konto?"
                  : "Delete your account?"
                : sv
                  ? "Nollställ smakminnet?"
                  : "Reset taste memory?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {action === "delete_account"
                ? sv
                  ? "Kontot stängs och källare, bilder, delningar och historik raderas. Det går inte att ångra. Exportera uppgifterna först om du vill behålla dem. Leverantörskopior hanteras enligt integritetsinformationen."
                  : "Your account closes and cellar, images, shares and history are erased. This cannot be undone. Export your data first to keep it. Provider copies follow the privacy information."
                : sv
                  ? "Inlärda preferenser och rekommendationsfeedback tas bort. Viner, betyg och dina angivna preferenser behålls. Nya aktiviteter kan bygga ett nytt smakminne."
                  : "Learned preferences and recommendation feedback are removed. Wines, ratings and stated preferences stay. New activity can build new taste memory."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex min-h-12 items-center gap-3 text-base">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
              disabled={busy}
            />
            {sv ? "Jag vill genomföra åtgärden" : "I want to perform this action"}
          </label>
          {actionError && (
            <p role="alert" className="text-base text-red-300">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{sv ? "Avbryt" : "Cancel"}</AlertDialogCancel>
            <Button onClick={performAction} disabled={!confirmed || busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : action === "delete_account" ? (
                <Trash2 className="h-4 w-4" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {action === "delete_account"
                ? sv
                  ? "Radera kontot"
                  : "Delete account"
                : sv
                  ? "Nollställ"
                  : "Reset"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
