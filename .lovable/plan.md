# Plan för fortsatt utveckling av Winesnap 2.0

Appen har nu ett komplett grundflöde: scan (foto + text), cellar, taste-profil, AI-förslag, wine detail med aroma-hjul, profil och i18n. Här är en prioriterad roadmap i fyra faser.

## Fas 1 – Polish & färdigställande (kort)
Slutför det som fortfarande är halvfärdigt innan nya features.

1. **Fullständig svensk översättning**
   Idag är bara nav, home och profile översatta. Översätt: taste, cellar, cellar.overview, scan, for-you, wine.$id (+ tabs), search, login, about.
2. **Tomma states överallt**
   Standardiserade "empty state"-komponenter (ikon + rubrik + CTA) på: cellar, for-you, history, search utan träffar.
3. **Loading & error states**
   Skeletons istället för spinners på cellar, wine detail, for-you. Toast + retry vid AI-fel.
4. **Tasting Notes: spara + lista**
   Just nu är editorn löst kopplad. Skapa `tasting_notes`-tabell (wine_id, user_id, rating, aromas[], palate, finish, notes, tasted_at, location) med RLS och lista tidigare noter under vinet.

## Fas 2 – Vinupplevelsen (medel)
Fördjupa kärnfunktionerna.

5. **Delning & export**
   Delbar publik vy `/w/:shareId` (read-only) för ett vin, plus "Dela"-knapp med Web Share API.
6. **Sök & filter i Cellar**
   Riktig sökruta + filterchips (typ, land, årgång, rating) och sortering (nyast, högst betyg, äldst årgång).
7. **Drickfönster & notifikationer**
   Beräkna optimalt drickfönster per vin (AI vid scan) och visa "Dags att öppna"-lista på hem.
8. **Foto-hantering**
   Beskär/rotera etikett innan uppladdning, visa både etikett + genererad "hero"-bild på wine detail.
9. **Manuell redigering**
   Låt användaren rätta AI-fält (producent, årgång, region, druvor, pris) på wine detail.

## Fas 3 – Social & upptäckt (större)
10. **Vänner & flöde**
    Följ andra användare, se deras senaste scans/betyg i ett flöde.
11. **Wishlist**
    Separat lista utöver cellar (viner du vill prova). AI-förslag kan sparas hit direkt.
12. **Restaurangläge**
    Snabbläge: fota en vinlista → AI föreslår 2–3 val baserat på din taste-profil och budget.

## Fas 4 – Kvalitet & drift
13. **PWA + offline**
    Installerbar, offline-cache för cellar och senaste wine detail.
14. **Onboarding**
    3-stegs intro första gången (välj typer/regioner/druvor → gå direkt in i taste-profilen).
15. **Analytics & telemetri**
    Enkel event-logg (scans, favoriter, AI-förslag klickade) för att styra vidareutveckling.
16. **Säkerhetsgenomgång**
    Kör linter, gå igenom RLS på alla tabeller, roterbara nycklar, rate limit på edge functions.

## Föreslagen ordning att köra
Fas 1 i sin helhet först (1 iteration), sedan välj **en** feature från Fas 2 i taget. Fas 3 kräver mer designdiskussion – ta den när Fas 1–2 sitter.

## Vad vill du att jag börjar med?
Säg t.ex. "kör Fas 1" eller peka ut specifika punkter (t.ex. "1, 2 och 4"), så gör jag en detaljerad implementationsplan för just det.
