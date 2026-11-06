import { AlertCircle, CheckCheck, CloudOff, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import "./operation-notice.css";

export function OperationNotice({
  kind,
  children,
  action,
}: {
  kind: "loading" | "error" | "offline" | "pending" | "success";
  children: ReactNode;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const Icon =
    kind === "loading"
      ? Loader2
      : kind === "offline"
        ? CloudOff
        : kind === "success"
          ? CheckCheck
          : kind === "pending"
            ? RefreshCw
            : AlertCircle;
  return (
    <section
      className="operation-notice"
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" ? true : undefined}
      data-kind={kind}
    >
      <div>
        <Icon size={20} aria-hidden className={kind === "loading" ? "animate-spin" : undefined} />
        <p>{children}</p>
      </div>
      {action && (
        <button type="button" disabled={action.disabled} onClick={action.onClick}>
          <RefreshCw size={18} aria-hidden />
          {action.label}
        </button>
      )}
    </section>
  );
}
