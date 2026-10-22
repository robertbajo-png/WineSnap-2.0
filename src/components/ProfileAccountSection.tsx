import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { useT } from "@/i18n";

export function ProfileAccountSection({
  checking,
  signedIn,
  children,
}: {
  checking: boolean;
  signedIn: boolean;
  children: ReactNode;
}) {
  const t = useT();
  if (checking || signedIn) return children;
  return (
    <section className="my-6 space-y-4">
      <p className="text-base text-muted-foreground">{t("login.signInSub")}</p>
      <Link
        to="/login"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-base font-medium text-primary-foreground"
      >
        <LogIn className="h-5 w-5" aria-hidden="true" />
        {t("login.signIn")}
      </Link>
    </section>
  );
}
