import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/i18n";
import { privacyInformationComplete, siteInformation } from "@/lib/siteInformation";
import { privacyControlsEnabled } from "@/lib/privacyControls";
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
            ? "Dataskyddsupplägget nedan är beslutat. Drift, leverantörsvillkor och återstående uppgifter är ännu inte fullständigt verifierade inför offentlig release."
            : "The privacy policy below is approved. Deployment, provider terms and remaining details are not yet fully verified for public release."}
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
        ) : null}
        {siteInformation.postalAddress && (
          <address className="not-italic break-words">{siteInformation.postalAddress}</address>
        )}
        {!siteInformation.contact && !siteInformation.postalAddress && (
          <p>
            {sv ? "Offentlig supportadress ej angiven" : "Public support address not specified"}
          </p>
        )}
        <p>
          {sv
            ? "Kontakta ansvarig för frågor, rättelse, radering, invändningar eller registerutdrag. Begäranden hanteras utan onödigt dröjsmål och normalt inom en månad. Under Profil finns export, nollställning av smakminnet och kontoradering när backendfunktionerna är driftsatta. Exporten inkluderar bildfiler; större exporter eller uppgifter i leverantörsloggar hanteras genom en begäran till ansvarig."
            : "Contact the responsible party about questions, correction, erasure, objections or access requests. Requests are handled without undue delay, normally within one month. Profile offers export, taste-memory reset and account erasure after backend deployment. Export includes image files; larger exports and personal data in provider logs are handled through an access request."}
        </p>
      </section>
      {!privacyControlsEnabled && (
        <p className="mt-4 text-base leading-relaxed">
          {sv
            ? "Utökad export och självbetjäning för radering väntar på driftsättning. Den befintliga JSON-exporten omfattar appens databas, inte bildfiler. Rättighetsbegäranden kan alltid skickas till ansvarig."
            : "Extended export and self-service erasure await deployment. The existing JSON export covers the application database, not image files. You can always send rights requests to the responsible party."}
        </p>
      )}
      <section className="mt-6 space-y-3 text-base leading-relaxed">
        <h2 className="font-display text-xl">{sv ? "Uppgifter och användning" : "Data and use"}</h2>
        <p>
          {sv
            ? "WineSnap sparar kontouppgifter, vinbilder, källare, köp, önskelista, betyg, smakpreferenser och AI-historik för appens funktioner. Frivillig användningsstatistik är avstängd i denna version. Smakminnet drar slutsatser från dina preferenser och aktiviteter för personliga vinförslag, inte för beslut med rättsliga eller liknande betydande konsekvenser. Du kan nollställa det utan att radera dina viner eller betyg."
            : "WineSnap stores account details, wine photos, cellar entries, purchases, wishlist, ratings, taste preferences and AI history for its features. Optional usage statistics are disabled in this version. Taste memory derives preferences from your settings and activity for personal wine suggestions, not decisions with legal or similarly significant effects. You can reset it without deleting wines or ratings."}
        </p>
        <p>
          {sv
            ? "Bilder och text du skickar för AI-analys behandlas via Lovables AI-gateway och vald AI-leverantör. Konto och appdata hanteras med Supabase och Lovable. Undvik känsliga uppgifter i bilder och frågor. Publika profiler, publika viner och delningslänkar gör avsiktligt valda uppgifter tillgängliga för andra."
            : "Images and text you submit for AI analysis are processed through Lovable's AI gateway and the selected AI provider. Account and application data are handled using Supabase and Lovable. Avoid sensitive information in images and questions. Public profiles, public wines and share links make intentionally selected data available to others."}
        </p>
        <p>
          {siteInformation.legalBasis ??
            (sv
              ? "Rättslig grund: avtal för behandling som är nödvändig för tjänstens begärda funktioner. Begränsad säkerhets- och missbruksbekämpning avses stödjas på berättigat intresse efter dokumenterad intresseavvägning. Det innebär inte tillstånd att använda uppgifterna för andra ändamål."
              : "Legal basis: contract for processing necessary for requested service features. Limited security and abuse prevention is intended to rely on legitimate interests after a documented balancing assessment. This does not permit use for unrelated purposes.")}
        </p>
        <p>
          {siteInformation.retention ??
            (sv
              ? "Beslutad lagring: konto, källare, sparade bilder och preferenser så länge tjänsten behövs, med regelbunden prövning vid långvarig inaktivitet. AI-konversationer gallras efter 90 dagar när schemalagd gallring är aktiverad. Inga konton raderas automatiskt på grund av inaktivitet utan föregående prövning och information. Osparade skanningsbilder lagras inte i källaren. Övergivna uppladdningar städas inom målet 24 timmar med övervakad gallring."
              : "Approved retention: account, cellar, saved images and preferences while the service is needed, with periodic review of prolonged inactivity. AI conversations expire after 90 days once scheduled cleanup is active. Inactivity alone does not automatically erase accounts without prior review and notice. Unsaved scans are not stored in the cellar. Abandoned uploads are cleaned within the 24-hour target using monitored maintenance.")}
        </p>
        <p>
          {sv
            ? "Målet är 14 dagar för felsökningsloggar och 30 dagar för säkerhetsloggar. Säkerhetskopiors mål är högst 30 dagar, men faktisk tid och AI-leverantörernas lagring måste bekräftas för den använda tjänsten. Nollagring, EU-exklusiv behandling eller omedelbar radering ur säkerhetskopior utlovas inte. Vid återställning måste tidigare raderingar tillämpas på nytt."
            : "Targets are 14 days for diagnostic logs and 30 days for security logs. Backup retention targets at most 30 days, but actual periods and AI-provider retention must be confirmed for the service used. Zero retention, EU-only processing or immediate backup erasure are not promised. Previously requested erasures must be reapplied after restoration."}
        </p>
        <p>
          {sv
            ? "En begränsad raderingsjournal med konto-ID och tidpunkter sparas under handläggningen och 30 dagar efter slutförd radering för att förhindra återkomst från säkerhetskopior. Journalen är inte åtkomlig för andra användare."
            : "A limited erasure ledger containing account ID and timestamps is kept during processing and for 30 days after completed erasure to prevent recovery from backups. Other users cannot access the ledger."}
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
