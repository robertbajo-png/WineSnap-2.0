## Winesnap 2.0

En elegant mobil-först webbapp där användaren fotar en vinetikett och får tillbaka detaljerad vininfo, smakprofil och matförslag. Bygger på samma struktur som ScentSnap men med ett rikt vintema och utan betalvägg.

### Designsystem — Burgundy & Champagne
- **Primär**: djup burgundy/bordeaux (vinröd)
- **Bakgrund**: varm champagne/cream
- **Accent**: gyllene champagne, mjuk roséskimmer
- **Typografi**: serif (Cormorant Garamond) för rubriker, Inter för UI — lyxig vinkänsla
- **Komponenter**: rundade kort, mjuka skuggor, gradient-knappar i burgundy→plommon, guldlinjer som accent
- Ljust läge som standard, mörkt läge förberett

### Sidor & navigation
Bottennav (mobil) + topplogga, samma flöde som ScentSnap:
- **/** — Hem: stor "Fota vinetikett"-knapp + "Ladda upp bild" + senaste fynd
- **/for-you** — Personliga rekommendationer baserat på din smakprofil
- **/history** — Alla vin du skannat, sökbar/filtrerbar (rött/vitt/rosé/mousserande)
- **/taste** — Din smakprofil: favoritdruvor, regioner, smakvärldar (visualiserad)
- **/wine/$id** — Detaljvy för ett specifikt vin
- **/me** — Profil + inställningar
- **/login** — E-postinloggning (Lovable Cloud auth)
- **/admin** — Adminvy (rolltabell)
- **/about** — Om appen

### Kärnfunktion: Skanna vin
1. Användare fotar/laddar upp etikett
2. Bilden skickas till en edge function som anropar Lovable AI (vision-modell)
3. AI returnerar strukturerad data:
   - **Vininfo**: producent, vinnamn, druva(or), årgång, region, land, vintyp (rött/vitt/rosé/mousserande)
   - **Beskrivning**: kort sommelierstil-text
   - **Smakprofil** (visualiserad som mätare):
     - Frukt, tannin, syra, ek, sötma, fyllighet
   - **Aromnoter** i pyramid (primära/sekundära/tertiära)
   - **Matparning**: 3–5 konkreta rätter som passar
   - **Servering**: temperatur, glas, dekantering ja/nej
4. Resultatet sparas i historiken och uppdaterar smakprofilen

### Smakprofil
Räknas fram från användarens skannade vin — visar favoritregioner, druvor och smakvärldar. Driver "För dig"-rekommendationer.

### Matparning (visualiserat)
Korta kort med rätt + en mening om varför det passar (ex: "Lammfilé — tanninerna mjukas upp av fettet").

### Backend (Lovable Cloud)
- **Auth**: e-post + lösenord, eventuellt Google senare
- **Tabeller**:
  - `profiles` — användarprofil
  - `user_roles` — separat rolltabell (admin/user) med has_role-funktion
  - `wines` — sparade vinskanningar (foto-URL, AI-output JSON, taggar)
  - `taste_profile` — sammanräknade preferenser per användare
- **Storage**: bucket för vinetikett-foton
- **Edge functions**:
  - `analyze-wine` — tar bild, anropar Lovable AI vision, returnerar strukturerad JSON
  - `recommend-wines` — bygger "För dig"-listan utifrån smakprofilen

### Vad som INTE ingår nu
- Ingen paywall, inga Stripe-komponenter (kan läggas till senare)
- Ingen e-handel/inköpslänkar (kan läggas till senare)

### Leverans i denna iteration
1. Sätta upp burgundy/champagne-designsystem i `styles.css`
2. Aktivera Lovable Cloud + skapa tabeller, RLS, storage-bucket
3. Bygga alla routes med skelett + bottennav + AppShell
4. Implementera skanna-flödet end-to-end (kamera/upload → edge function → resultatkort)
5. Historik + smakprofil + "För dig" baserat på riktig data
6. Login + me + admin

Efter detta kan vi iterera på finputs (matparningsbilder, animationer, delning, mörkt läge etc.).