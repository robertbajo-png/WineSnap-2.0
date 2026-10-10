import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/i18n";
import { privacyInformationComplete, siteInformation } from "@/lib/siteInformation";
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy | WineSnap" }] }),
  component: PrivacyPage,
});
function PrivacyPage() {
  const { lang } = useI18n();
  const sv = lang === "sv";
  return (
    <AppShell>
      <h1 className="font-display text-2xl text-gold">
        {sv ? "Integritet och dina data" : "Privacy and your data"}
      </h1>
      {!privacyInformationComplete && (
        <p role="alert" className="mt-4 border-l-2 border-gold pl-3 text-base">
          {sv
            ? "Integritetsinformationen är inte fullständig ännu. Ansvarig, kontakt, rättslig grund och lagringstid måste bekräftas före offentlig release."
            : "Privacy information is not complete yet. The responsible party, contact, legal basis and retention must be confirmed before public release."}
        </p>
      )}
      <section className="mt-6 space-y-3 text-base leading-relaxed">
        <h2 className="font-display text-xl">
          {sv ? "Ansvarig och kontakt" : "Responsible party and contact"}
        </h2>
        <p>
          {siteInformation.operator ??
            (sv ? "Ansvarig ej angiven" : "Responsible party not specified")}
        </p>
        {siteInformation.contact ? (
          <a
            className="inline-flex min-h-11 items-center break-all text-gold"
            href={`mailto:${siteInformation.contact}`}
          >
            {siteInformation.contact}
          </a>
        ) : (
          <p>
            {sv ? "Offentlig supportadress ej angiven" : "Public support address not specified"}
          </p>
        )}
        <p>
          {sv
            ? "Kontakta ansvarig för frågor, rättelse, radering eller en begäran om tillgång. Export av uppgifter i appens databas finns under Profil. Bildfiler, leverantörsloggar och säkerhetskopior ingår inte i appens JSON-export."
            : "Contact the responsible party about questions, correction, deletion or access requests. Application database export is available under Profile. Image files, provider logs and backups are not included in the application's JSON export."}
        </p>
      </section>
      <section className="mt-6 space-y-3 text-base leading-relaxed">
        <h2 className="font-display text-xl">{sv ? "Uppgifter och användning" : "Data and use"}</h2>
        <p>
          {sv
            ? "WineSnap sparar kontouppgifter, vinbilder, källare, köp, önskelista, betyg, smakpreferenser och AI-historik för appens funktioner. Funktionshändelser registreras också för analys av användningen."
            : "WineSnap stores account details, wine photos, cellar entries, purchases, wishlist, ratings, taste preferences and AI history for its features. Feature events are also recorded for usage analysis."}
        </p>
        <p>
          {sv
            ? "Bilder och text du skickar för AI-analys behandlas via Lovables AI-gateway och vald AI-leverantör. Konto och appdata hanteras med Supabase och Lovable. Undvik känsliga uppgifter i bilder och frågor. Publika profiler, publika viner och delningslänkar gör avsiktligt valda uppgifter tillgängliga för andra."
            : "Images and text you submit for AI analysis are processed through Lovable's AI gateway and the selected AI provider. Account and application data are handled using Supabase and Lovable. Avoid sensitive information in images and questions. Public profiles, public wines and share links make intentionally selected data available to others."}
        </p>
        <p>
          {siteInformation.legalBasis ??
            (sv ? "Rättslig grund: ännu inte fastställd." : "Legal basis: not yet confirmed.")}
        </p>
        <p>
          {siteInformation.retention ??
            (sv
              ? "Lagringstid och hantering av leverantörskopior: ännu inte fastställda."
              : "Retention and provider copies: not yet confirmed.")}
        </p>
        <a
          href="https://www.imy.se/privatperson/dataskydd/dina-rattigheter/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-gold"
        >
          {sv ? "Dina rättigheter hos IMY" : "Your rights: Swedish privacy authority"}
        </a>
      </section>
    </AppShell>
  );
}
