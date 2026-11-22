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
| `gesundheit_ueberblick` | Alle Bereiche, jeweils mit Mittelwert, letztem Wert und Veränderung zum Zeitraum davor |
| `schlaf_naechte` | Jede Nacht mit Einschlaf- und Aufwachzeit und den Phasen Tief, Kern, REM und Wach |
| `tageswerte` | Ein Wert pro Tag für beliebige Messgrößen (Schritte, Ruhepuls, HRV, VO₂max …) |
| `ernaehrung` | Kalorien, Makros, Wasser, Koffein, Natrium pro Tag |
| `workouts` | Trainings mit Dauer, kcal, Distanz und Puls |
| `rohwerte` | Einzelmessungen mit Uhrzeit, z. B. die Herzfrequenz über den Tag |
| `verfuegbare_daten` | Welche Daten es gibt und wie weit sie zurückreichen |

Alle Werkzeuge lesen nur. Claude kann über sie nichts ändern oder löschen.

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
| `lib/bodybuilding.mjs` | Trend, Tempo, TDEE, Bilanz, Eiweiß/kg, Magermasse, FFMI, Kraft pro Woche |
| `api/mcp.mjs`, `lib/mcp.mjs` | MCP-Server (Streamable HTTP, zustandslos, nur lesend) |
| `lib/abfragen.mjs` | Tageswerte, Schlaf, Workouts, Überblick – gemeinsam für Dashboard und Claude |
| `lib/katalog.mjs` | Messgrößen, deutsche Namen, Einheiten, Tagesaggregation |
| `lib/db.mjs` | Postgres (`postgres`) bzw. lokal PGlite; Schema |

Tageswerte: **Summen** wie Schritte oder kcal werden pro Quelle addiert, gezählt wird die stärkste Quelle, damit iPhone und Watch nicht doppelt eingehen. **Mittelwerte** wie Puls oder HRV werden über den Tag gemittelt, inklusive Min und Max. Bei **Körperwerten** wie dem Gewicht zählt die letzte Messung des Tages. Eine Nacht gehört zum Tag des Aufwachens.

## Lokal

```bash
cd health-bridge
npm install
npm run demo     # http://localhost:5174 mit 120 Tagen Beispieldaten (PGlite im Speicher)
npm test         # 84 Prüfungen; mit DATABASE_URL gegen echtes Postgres
```
