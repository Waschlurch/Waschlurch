# Puls – Apple Health ⇄ Claude

Deine Apple-Health-Daten landen automatisch in einer eigenen Datenbank. Dort zeigt sie ein Dashboard an, und Claude liest sie über einen eigenen Connector. Exportieren musst du nichts mehr.

```
iPhone (Health Auto Export oder Kurzbefehl, täglich)  →  POST /api/sync  →  Postgres
                                                                         ├─ Dashboard (PWA)
                                                                         └─ /mcp/<Token>  →  Claude
```

Apple lässt Health-Daten nur auf dem iPhone selbst auslesen. Deshalb schickt ein Helfer auf dem iPhone die Daten regelmäßig an Puls.

## Was Claude kann

| Werkzeug | Inhalt |
|---|---|
| `bodybuilding_analyse` | Trendgewicht, Tempo in kg und % pro Woche im Vergleich zum Phasenziel, adaptiver TDEE, Energiebilanz, empfohlene kcal, Eiweiß g/kg, Körperfett, Magermasse, FFMI, Taille, Krafttraining pro Woche |
| `coach_analyse` | Wochen-Score, Vergleich zur Vorwoche, Warnungen und Empfehlungen |
| `training_auswertung` | Split-Tage, Muskelgruppen-Frequenz, Trainingsarten, Abweichungen, Intensität nach Schlaf |
| `protokoll_und_plan` | Phasen, Trainingsrhythmus, Ziele, Trainings-/Rest-Day und Cheat Days pro Tag |
| `gesundheit_ueberblick` | Alle Bereiche, jeweils mit Mittelwert, letztem Wert und Veränderung zum Zeitraum davor |
| `schlaf_naechte` | Jede Nacht mit Einschlaf- und Aufwachzeit und den Phasen Tief, Kern, REM und Wach |
| `tageswerte` | Ein Wert pro Tag für beliebige Messgrößen (Schritte, Ruhepuls, HRV, VO₂max …) |
| `ernaehrung` | Kalorien, Makros, Wasser, Koffein, Natrium pro Tag |
| `workouts` | Trainings mit Dauer, kcal, Distanz und Puls |
| `rohwerte` | Einzelmessungen mit Uhrzeit, z. B. die Herzfrequenz über den Tag |
| `verfuegbare_daten` | Welche Daten es gibt und wie weit sie zurückreichen |

Alle Werkzeuge lesen nur. Claude kann über sie nichts ändern oder löschen.

## Coach-Analyse, Phasen, Rhythmus, Protokoll

- **Coach-Analyse:** Die letzten 7 Tage werden mit den 7 Tagen davor verglichen. Daraus entstehen ein **Wochen-Score** von 0 bis 100 (Gewichtstempo, Kalorien, Eiweiß, Training, Schlaf, Aktivität), ein Urteil „besser/schlechter“ und eine Vergleichstabelle. Dazu kommen priorisierte Hinweise mit konkreten Zahlen. Beispiele:
  - zu schnelle oder zu langsame Zunahme mit der Korrektur in kcal
  - Rest-Days über Ziel und zu knappe Trainingstage
  - Eiweiß unter Ziel
  - zu wenig Schlaf
  - eingeschränkte Erholung (HRV/Ruhepuls gegen den 4-Wochen-Schnitt)
  - Schritte und Cardio
  - ausgelassene Trainingstage
  - Cheat Days
  - Muster: Schlaf hebt die HRV, Koffein kostet Schlaf
- **Phasen mit Startdatum:** Aufbau, Diät, Erhalt und Rekomposition. Die Phase bestimmt das Zieltempo, erscheint als Band in den Diagrammen und liefert „seit Start“-Werte.
- **Trainingsrhythmus:** zum Beispiel T·T·R ab einem Starttag. Ausnahmen trägst du pro Tag im Protokoll ein. Mit dem Rhythmus rechnet Puls getrennte Kalorienziele für Trainingstage und Rest-Days und prüft die Plantreue.
- **Training:** Workouts aus Apple Health werden ins Deutsche übersetzt und eingeordnet (Kraft, Cardio, Mobility), z. B. *Pool Swim* → Schwimmen und *Stair Climbing* → Stairmaster. Im Protokoll kannst du pro Tag eigene Einheiten ergänzen (Art und Minuten).
- **Split:** Vorlagen sind Push/Pull/Beine, Ober-/Unterkörper, Arnold, Bro-Split und Ganzkörper. Du kannst auch einen eigenen Split mit Muskelgruppen pro Tag anlegen. Der Split läuft über die Trainingstage deines Rhythmus. Die tatsächlich trainierte Einheit bestimmt Puls in dieser Reihenfolge: Eintrag im Protokoll, dann der Workout-Name (z. B. „Leg Day“ → Beine, „Chest & Triceps“ → Push), dann der Plan. Daraus ergeben sich die Frequenz pro Muskelgruppe und Woche, „Tage seit zuletzt“, Abweichungen von der Reihenfolge, Kalorien pro Split-Tag und Minuten pro Trainingsart. Der Coach warnt zum Beispiel bei „Beine seit 9 Tagen nicht trainiert“, bei weniger als 1,5× pro Woche oder bei viel Cardio im Aufbau.
- **Protokoll:** Ein Tag im Raster lässt sich antippen. Dort markierst du einen Cheat Day, änderst Trainings- oder Rest-Day oder schreibst eine Notiz.
- **Zoom:** In jedem Diagramm mit zwei Fingern auf- und zuziehen. Am Rechner geht das mit Strg + Mausrad, von 7 Tagen bis zu einem Jahr. Gerechnet wird im Browser (`kern/`), deshalb lädt beim Zoomen nichts nach. Claude nutzt denselben Kern.

## YAZIO & Ernährung

YAZIO hat keine öffentliche Schnittstelle. Inoffizielle Zugänge würden dein YAZIO-Passwort brauchen und verstoßen gegen die Nutzungsbedingungen, deshalb nutzt Puls sie nicht. Der Weg führt so: **YAZIO → Apple Health → Health Auto Export → Puls**.
1. In YAZIO unter *Profil → Einstellungen → Apps & Geräte* Apple Health verbinden und das Schreiben von Ernährungsdaten erlauben. Danach in der Health-App unter *Ernährung → Datenquellen* prüfen, welche Werte YAZIO dort schreibt.
2. In Health Auto Export Ernährung exportieren (Energie, Eiweiß, Kohlenhydrate, Fett, Natrium, Zucker, Ballaststoffe, Wasser, Koffein und Mikronährstoffe), dabei **„Daten zusammenfassen“ für Ernährung ausschalten**. Nur so kommen die Einträge mit Uhrzeit an.

Daraus macht Puls:
- **Mahlzeiten:** Einträge im Abstand von weniger als 75 min gehören zu einer Mahlzeit. Mehrere Lebensmittel mit derselben Uhrzeit werden addiert.
- **Timing:**
  - Eiweiß pro Mahlzeit (Ziel ≈ 0,4 g/kg)
  - Kohlenhydrate und Eiweiß in den 3 h vor und 2 h nach dem Krafttraining
  - Essensfenster
  - Abstand der letzten Mahlzeit zum Schlafbeginn
- **Zeitleiste:** die letzten 7 Tage mit Mahlzeiten, Training und Schlafbeginn.
- **Mikronährstoffe gegen Richtwerte:** Ballaststoffe, Wasser, Kalium, Magnesium, Calcium, Eisen, Vitamin D, Natrium, Zucker und gesättigte Fette.
- **Morgengewicht nüchtern:** Als Tageswert zählt die erste Messung vor 11 Uhr. Gibt es nur eine Abendmessung, nutzt Puls sie und markiert sie.
- **Neue Zusammenhänge:** späte Mahlzeit → Schlaf und HRV, Natrium am Vortag → Wasser auf der Waage, Kohlenhydrate am Vortag bzw. vor dem Training → Trainingsintensität.
- **Bereitschaft heute:** berücksichtigt jetzt auch die Ernährung von gestern (Kalorien gegen Ziel, Kohlenhydrate pro kg) und die letzte Mahlzeit. Dazu gibt es eine Checkliste zur Trainingsvorbereitung.

## Intelligente Analyse & KI-Coach

- **Was deine Daten verraten:** Puls prüft physiologisch plausible Hypothesen mit Pearson-Korrelation und t-Test, auch mit einem Tag Versatz. Beispiele: Schlaf → HRV, Koffein am Vortag → Schlaf, Krafttraining → Ruhepuls am Folgetag, Kohlenhydrate → Trainingsintensität, Wochenbilanz → Gewicht. Gezeigt wird ein Zusammenhang nur bei p < 0,05, |r| ≥ 0,25 und mindestens 14 Tagen, jeweils mit Effekt in Klartext („+9,5 ms HRV nach langen Nächten“). Puls prüft nicht alles gegen alles, das hält Zufallstreffer bei etwa 5 %. Ein Test misst diese Fehlalarmquote.
- **Bereitschaft heute (0–100):** HRV und Ruhepuls als z-Wert gegen 28 Tage, die letzte Nacht und die Belastung der letzten 3 Tage. Daraus folgt eine Empfehlung für das heutige Training.
- **Trends und Ausreißer:** Welch-t-Test der letzten 14 Tage gegen die 14 davor, z-Werte für Auffälligkeiten.
- **Prognose:** Gewicht in 4, 8 und 12 Wochen mit Unsicherheitsband sowie das voraussichtliche Datum fürs Zielgewicht.
- **Größte Hebel:** Lücken im Wochen-Score, gewichtet. Wenn möglich, belegt Puls sie mit deinen eigenen Zusammenhängen.
- **KI-Coach (Claude Opus 5.5):** Claude bekommt alle Kennzahlen, die Statistik, deine Ziele, Phasen, den Split und die letzten 14 Tage. Daraus schreibt er eine Coach-Analyse mit:
  - Prioritäten (Warum, Tun, Messen)
  - Kalorien und Makros für Trainings- und Rest-Days, auf Knopfdruck als Ziele übernehmbar
  - Training, Erholung, Warnsignale und Rückfragen

  Technisch: strukturierte JSON-Ausgabe, automatischer Fallback bei Ablehnung, Prompt-Caching. Jeder Bericht wird gespeichert. Der KI-Coach braucht `ANTHROPIC_API_KEY` in Vercel. In der Vorschau läuft er stattdessen über dein Claude-Konto.

## Vorlagen & Ziele

Mit dem Regler-Symbol oben öffnest du **Ansicht & Ziele**:
- **Vorlagen:** Bodybuilding, Definition, Erholung & Schlaf, Ausdauer, Kompakt. Daneben gibt es „Eigene“.
- **Kennzahlen oben:** 18 Kacheln stehen zur Wahl, zum Beispiel Trendgewicht, Pro Woche, Eiweiß/kg, Energiebilanz, TDEE, Körperfett, Magermasse, FFMI, Taille, Kraft/Woche, Schlaf oder HRV.
- **Bereiche:** Körper & Aufbau, Krafttraining, Ernährung, Schlaf, Herz, Aktivität. Du kannst sie ein- und ausblenden und ihre Reihenfolge ändern.
- **Ziele:** Phase (Aufbau, Diät, Erhalt, Rekomposition), Tempo in % KG pro Woche, Zielgewicht, Eiweiß in g/kg, Kalorienziel, Größe, Krafteinheiten pro Woche, Schritte und Schlaf.

Die Einstellungen liegen in der Datenbank. Dadurch zeigen iPhone und Mac dasselbe, und Claude rechnet mit denselben Zielen.

**So rechnet Puls:**
- *Trendgewicht:* Die Messungen werden exponentiell geglättet (10 % pro Tag). Schwankungen durch Wasser und Salz fallen dadurch heraus.
- *Tempo:* Steigung des Trends über die letzten 14 Tage.
- *TDEE:* Ø Zufuhr der letzten 21 Tage minus Gewichtsänderung × 7700 kcal/kg, geteilt durch die Tage. Dafür braucht es mindestens 10 geloggte Tage, sonst nimmt Puls den Verbrauch aus Apple Health.
- *Empfehlung:* TDEE plus das Zieltempo in kcal.
- *Magermasse:* Wird sie gemessen, gilt der Messwert. Sonst rechnet Puls Gewicht × (1 − Körperfett).
- *FFMI:* Magermasse / Größe² + 6,1 × (1,8 − Größe).
- *Krafttraining:* Workouts, deren Art Kraft, Strength, Functional, HIIT, Core oder CrossFit enthält. Apps wie Hevy oder Strong schreiben solche Einträge nach Apple Health.

## Einrichtung (ca. 15 Minuten)

### 1. Datenbank – Supabase (kostenloser Tarif reicht)
1. Lege auf supabase.com ein Projekt an (Region Frankfurt).
2. Öffne **Connect → Transaction pooler** und kopiere die URI (Port 6543). Das ist `DATABASE_URL`.
3. Puls legt die Tabellen beim ersten Aufruf selbst an. Alternativ: `node scripts/schema.mjs` ausgeben lassen und das SQL im SQL-Editor ausführen.

Jede andere Postgres-Datenbank (Neon, Railway, eigene) funktioniert genauso.

### 2. Vercel
1. Lege ein neues Projekt aus diesem Repository an. **Root Directory: `health-bridge`**, Framework „Other“.
2. Setze diese Umgebungsvariablen:
   - `DATABASE_URL`: aus Schritt 1
   - `PULS_TOKEN`: langer Zufallswert, z. B. `openssl rand -hex 32`. Er schützt den Sync und den Connector.
   - `PULS_PASSCODE`: dein Code für das Dashboard
   - `ANTHROPIC_API_KEY` (optional): für den KI-Coach, von console.anthropic.com
   - `PULS_TZ` (optional): Zeitzone, Standard `Europe/Berlin`
3. Deployen, die Adresse am iPhone in Safari öffnen und über *Teilen → Zum Home-Bildschirm* installieren.
4. Oben rechts auf **Claude** tippen. Dort stehen beide Adressen zum Kopieren bereit.

### 3. iPhone → Puls

**Variante A: Health Auto Export (empfohlen, am vollständigsten)**
App „Health Auto Export – JSON+CSV“ installieren. Für REST-Automationen braucht sie Premium.
1. *Automations → Neu → REST API*
2. URL: `https://<deine-app>/api/sync?key=<PULS_TOKEN>`
3. Format **JSON**, Version 2. **Daten zusammenfassen: an** (Zeitraum „Tag“). Dadurch bleibt die Datenmenge klein und iPhone und Watch werden nicht doppelt gezählt.
4. Messwerte: alle, die du willst, mindestens Schlafanalyse, Ruhepuls, HRV, Schritte, Aktivenergie und Ernährung. **Workouts** zusätzlich einschalten.
5. Zeitraum „Seit letztem Sync“ oder „Letzte 7 Tage“, Intervall z. B. stündlich.
6. Einmal *Manueller Export* mit „Letzte 90 Tage“ ausführen, damit die Vergangenheit nachgeladen wird.

**Variante B: Apple Kurzbefehle (kostenlos)**
Lege den Kurzbefehl „Puls Sync“ an:
1. **Gesundheitsproben suchen**: Typ *Schritte*, Startdatum *in den letzten 2 Tagen*, gruppieren nach *Tag*.
2. **Wörterbuch** mit drei Einträgen:
   - `metrik` (Text): `Schritte`
   - `werte`: Variable *Gesundheitsproben* → *Wert*
   - `daten`: Variable *Gesundheitsproben* → *Startdatum*
3. **Zu Variable hinzufügen**: `Reihen`.
4. Schritte 1–3 für jede weitere Größe wiederholen, zum Beispiel *Ruhepuls*, *Herzfrequenzvariabilität*, *Aktivenergie*, *Nahrungsenergie*, *Protein* und *Gewicht*. Für Mittelwerte wie Puls oder HRV ebenfalls „nach Tag gruppieren“.
5. **Schlaf**: Gesundheitsproben suchen mit Typ *Schlafanalyse* für die letzten 2 Tage, *ohne* Gruppierung. Ins Wörterbuch kommen `metrik` = `Schlaf`, `werte` = *Wert*, `daten` = *Startdatum* und `enddaten` = *Enddatum*.
6. **Inhalte von URL abrufen**: URL `https://<deine-app>/api/sync?key=<PULS_TOKEN>`, Methode *POST*, Anforderungstext *JSON*, Feld `reihen` = Variable `Reihen`.
7. *Automation → Tageszeit* (z. B. 7:30, täglich) → *Sofort ausführen* → Kurzbefehl „Puls Sync“.

Deutsche und englische Namen werden beide erkannt („Schritte“ oder `step_count`). Zahlen und Daten im deutschen Format verarbeitet Puls ebenfalls. Wenn du zweimal sendest, entstehen keine doppelten Einträge.

> iOS gibt Health-Daten nur bei entsperrtem iPhone heraus. Läuft eine Automation, während das iPhone gesperrt ist, holt der nächste Lauf die fehlenden Daten nach.

### 4. Claude verbinden
- **claude.ai / Claude-App:** *Einstellungen → Connectors → Benutzerdefinierten Connector hinzufügen*. Name „Puls“, URL `https://<deine-app>/mcp/<PULS_TOKEN>`. Danach im Chat über das Werkzeug-Menü einschalten.
- **Claude Code:** `claude mcp add --transport http puls https://<deine-app>/mcp/<PULS_TOKEN>`
- **Claude Desktop:** wie bei claude.ai, Connectors werden synchronisiert.

Probier zum Beispiel: *„Wie war mein Schlaf diese Woche im Vergleich zur letzten, und hängt er mit meinem Training zusammen?“*

## Sicherheit
- Gesundheitsdaten sind sensibel. Die Connector-URL enthält den Token, behandle sie also wie ein Passwort. Ist sie in falsche Hände geraten, setzt du in Vercel einen neuen `PULS_TOKEN` und trägst die neue Adresse am iPhone und in Claude ein.
- Ohne `PULS_TOKEN` oder `PULS_PASSCODE` lehnt Puls in Produktion jede Anfrage ab.
- Die Daten liegen nur in deiner eigenen Datenbank. Claude liest sie, wenn du im Chat danach fragst. Was im Gespräch landet, gilt dann wie jede andere Nachricht an Claude.

## Aufbau

| Pfad | Aufgabe |
|---|---|
| `index.html`, `app.css`, `app.js`, `diagramme.js` | Dashboard ohne Build-Schritt; SVG-Diagramme mit Tooltips, Tabellenansicht, hell/dunkel |
| `api/sync.mjs`, `lib/import.mjs` | Eingang: Health Auto Export (v1/v2) und Kurzbefehl-JSON, Schlafsegmente → Nächte |
| `api/daten.mjs` | Daten fürs Dashboard (Zugangscode) |
| `api/einstellungen.mjs`, `lib/einstellungen.mjs` | Vorlagen, Kacheln, Bereiche, Ziele |
| `kern/rechnen.mjs`, `kern/analyse.mjs` | Rechenkern für Browser und Server: Trend, TDEE, Tagtyp, Phasen, Kalorienziele, Coach-Analyse |
| `api/protokoll.mjs`, `lib/protokoll.mjs` | Cheat Days, Tagtyp-Ausnahmen, Notizen |
| `kern/mahlzeiten.mjs` | Mahlzeiten aus Einzeleinträgen, Pre-/Post-Workout, Abstand zum Schlaf, Mikronährstoffe |
| `kern/erkenntnis.mjs` | Statistik-Motor: Zusammenhänge, Bereitschaft, Prognose, Trends, Ausreißer, Hebel |
| `kern/ki.mjs`, `api/ki-coach.mjs` | KI-Coach: Anweisung, Antwortschema, Datenkontext; Claude-Aufruf und Speicherung |
| `lib/bodybuilding.mjs` | Trend, Tempo, TDEE, Bilanz, Eiweiß/kg, Magermasse, FFMI, Kraft pro Woche |
| `api/mcp.mjs`, `lib/mcp.mjs` | MCP-Server (Streamable HTTP, zustandslos, nur lesend) |
| `lib/abfragen.mjs` | Tageswerte, Schlaf, Workouts, Überblick – gemeinsam für Dashboard und Claude |
| `lib/katalog.mjs` | Messgrößen, deutsche Namen, Einheiten, Tagesaggregation |
| `lib/db.mjs` | Postgres (`postgres`) bzw. lokal PGlite; Schema |

Tageswerte: **Summen** wie Schritte oder kcal werden pro Quelle addiert, gezählt wird die stärkste Quelle, damit iPhone und Watch nicht doppelt eingehen. **Mittelwerte** wie Puls oder HRV werden über den Tag gemittelt, inklusive Min und Max. Bei **Körperwerten** wie dem Gewicht zählt die letzte Messung des Tages. Eine Nacht gehört zum Tag des Aufwachens.

## Vorschau ohne Verbindung

`node scripts/vorschau.mjs` baut `vorschau/`. Das ist eine Seite mit Beispieldaten, die ohne Server und Datenbank läuft. Einstellungen bleiben dort nur im Browser, und die Werte, die von den Zielen abhängen, rechnet der Browser selbst neu.

## Lokal

```bash
cd health-bridge
npm install
npm run demo     # http://localhost:5174 mit 120 Tagen Beispieldaten (PGlite im Speicher)
npm test         # 159 Prüfungen; mit DATABASE_URL gegen echtes Postgres
```
