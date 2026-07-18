import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { useT } from "@/i18n";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About WineSnap" },
      { name: "description", content: "WineSnap — snap the label, get the sommelier's insight." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const t = useT();
  return (
    <AppShell>
      <Link to="/me" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("about.back")}
      </Link>
      <Logo size="lg" />
      <h1 className="mt-6 font-display text-3xl">{t("about.title")}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("about.body1")}</p>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("about.body2")}</p>
    </AppShell>
  );
}
