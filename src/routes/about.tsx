import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Om Winesnap" },
      { name: "description", content: "Winesnap — fota vinetiketten, få sommelierns insikt." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <AppShell>
      <Link to="/me" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tillbaka
      </Link>
      <Logo size="lg" />
      <h1 className="mt-6 font-display text-3xl">Om Winesnap</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Winesnap låter dig fota en vinetikett och få fram producent, druva, region, smakprofil
        och matparning på sekunder. Allt sparas i din historik och bygger din personliga smakprofil
        som driver rekommendationer i flödet "För dig".
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Drivs av AI-vision och en intern sommeliersmodell. Bilderna sparas privat i ditt konto.
      </p>
    </AppShell>
  );
}
