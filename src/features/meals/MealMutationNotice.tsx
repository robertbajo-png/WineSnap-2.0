import { OperationNotice } from "@/components/OperationNotice";
import { RefreshCw, Save } from "lucide-react";
import type { useMealMutation } from "./useMealMutation";

export function MealMutationNotice({ mutation }: { mutation: ReturnType<typeof useMealMutation> }) {
  return (
    <>
      {mutation.notice && <OperationNotice kind={mutation.kind}>{mutation.notice}</OperationNotice>}
      {mutation.waiting && (
        <div className="k-actions">
          <button
            type="button"
            className="k-secondary"
            disabled={mutation.busy}
            onClick={() => void mutation.inspect()}
          >
            <RefreshCw size={18} />
            Kontrollera sparandet
          </button>
          {mutation.canRetry && (
            <button
              type="button"
              className="k-secondary"
              disabled={mutation.busy}
              onClick={() => void mutation.retry()}
            >
              <Save size={18} />
              Försök spara igen
            </button>
          )}
        </div>
      )}
    </>
  );
}
