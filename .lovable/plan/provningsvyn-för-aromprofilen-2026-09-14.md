# Provningsvyn för aromprofilen

## Mål
Bygg om provningsvyn till designförslag 3 utan att påverka skanning, AI-modell eller övriga funktioner. AI-avlästa uppgifter och användarens egna provningsnoter ska visas och lagras strikt separat.

## Gränssnitt
- Bygg om `/wine/:id/notes` med WineSnaps befintliga mörka bakgrund, guldrubriker och högst 8 px radier.
- Lägg till tangentbordsstyrda flikar: **AI-förslag** och **Mina noter**.
- Visa AI-aromer skrivskyddat och utan påhittade standardvärden eller intensiteter.
- Visa personliga aromer som luftiga rader med rätt befintlig botanisk `AromaIcon`, aktiv/inaktiv-kryssruta och ett tillgängligt reglage **Svag–Tydlig**. Ny arom får okänd intensitet tills användaren själv väljer en nivå.
- Lägg till en riktig sökbar aromväljare med tangentbordsnavigering samt möjlighet att ange ett eget aromnamn.
- Lägg till redigerbar **Min sammanfattning**, och expanderbara sektioner för **Jämför med AI-förslaget** och **Visa aromhjul**.
- Behåll övriga provningsfält och en tydlig **Spara mina noter**-åtgärd. Sidan ska fungera utan överlappning på mobil och desktop.

## Data och säkerhet
- Ta bort den befintliga uppdateringen av `wines.primary_notes`, `wines.notes`, betyg och smakfält från notsparandet. Sparandet ska endast skriva till `tasting_notes`.
- Ladda AI-data från `wines` som skrivskyddat under AI-fliken och ladda endast den inloggade användarens egna `tasting_notes` som personlig historik.
- Tidigare noter visas som separata historikposter. En ny provning skapar en ny post; den senaste posten skrivs inte över av misstag.
- Behåll ägarbegränsningen i databasen och filtrera dessutom läsning/sparande på aktuell användare. Fel ska aldrig ge ett lyckat sparbesked.
- Blockera dubbla sparningar och varna vid navigation, omladdning eller stängning när formuläret har osparade ändringar.

## Minimal migration, förbereds men körs inte
- Lägg till en additiv `aroma_intensities jsonb`-kolumn på `tasting_notes`, med ett tomt objekt som standard för bakåtkompatibilitet.
- Ingen ny tabell, inga destruktiva ändringar och inga ändrade behörigheter eller policies.
- Lagra intensitet strukturerat per arom. Saknad intensitet förblir saknad och omvandlas aldrig till ett mittvärde.
- Migrationen sparas i projektet men appliceras inte mot produktionsdatabasen före granskning.

## Teknisk implementation
- Bryt ut rena funktioner för formulärvärden, normalisering, payload och dubbelklicksskydd så datareglerna kan testas utan gränssnittet.
- Återanvänd befintliga Button-, Tabs-, Collapsible-, Command-, Checkbox- och Slider-komponenter samt `AromaIcon`/`AromaWheel`.
- Lägg till full svensk och engelsk text samt komplett unik metadata för notsidan.

## Verifiering
- Fokuserade tester för AI/personlig separation, historikladdning, strukturerade intensiteter inklusive okänt värde, lyckad/misslyckad lagring och dubbla klick.
- Kör befintliga relevanta tester, typkontroll och produktionsbygge.
- Kontrollera sidan visuellt och interaktivt i desktop- och mobilstorlek, inklusive tangentbord, långa aromnamn, expanderade sektioner och osparad-varning.
- Ingen publicering och ingen produktionsmigration i denna omgång. Rapportera ändrade filer, verifierade resultat och att migrationen återstår att godkänna/applicera.
