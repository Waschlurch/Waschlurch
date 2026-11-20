# Ink Bridge – Goodnotes ⇄ Claude

Eine Web-App (PWA), die ganze **Goodnotes-Ordner** aufnimmt und Claude darin lesen lässt.

```
Goodnotes-Ordner  →  Bibliothek auf dem Gerät  →  Claude blättert selbst  →  PDF zurück in Goodnotes
```

1. **Bibliothek füllen.** Zwei Wege:
   - **Google Drive (lebende Verbindung).** Goodnotes sichert per *Auto-Backup* selbst als PDF nach Drive;
     Ink Bridge liest dieses Verzeichnis und gleicht es bei jedem Start ab. Kein Export von Hand.
     Gelesen werden nur Verzeichnisdaten; eine Datei wird erst heruntergeladen, wenn Claude eine Seite daraus braucht,
     und bleibt dann zwischengespeichert, bis Goodnotes sie ändert.
   - **Ordner vom Gerät.** Ganze Ordner samt Unterordnern hineinziehen oder über „Ordner laden“ wählen.
   Beides liegt in IndexedDB auf dem Gerät und ist beim nächsten Öffnen noch da.
2. **Claude arbeiten lassen.** Claude bekommt drei Werkzeuge und sucht sich selbst, was es braucht:
   `ordner_auflisten`, `notizen_suchen`, `notiz_lesen`. Man sieht live, welches Notizbuch es gerade öffnet.
   Angehakte Notizbücher schränken die Arbeit ein, nötig ist das nicht.
3. **Nachfragen.** Das Gespräch läuft weiter; Claude kennt die Bibliothek und das bereits Gelesene.
4. **Zurück nach Goodnotes.** Die Antwort wird zu einem PDF mit Papiermuster und Notizrand – „An Goodnotes senden“
   öffnet am iPad das Teilen-Menü.

Goodnotes hat keine öffentliche Schnittstelle. Die Brücke läuft deshalb über Export und Import,
so wie Goodnotes Dateien selbst austauscht.

## Warum das auch mit 500 Notizbüchern funktioniert

Hochgeladen wird **nicht die Bibliothek**, sondern nur, was Claude ausdrücklich anfordert.
Der Server ist zustandslos: Er reicht den Verlauf an Claude weiter und schickt einen Werkzeugwunsch
zurück an den Browser. Der Browser rendert die gewünschten Seiten (pdf.js) und schickt sie als Bilder
in das Werkzeug-Ergebnis. Wird der Verlauf zu groß, nimmt die App ältere Seitenbilder heraus –
Claude kann sie bei Bedarf erneut lesen.

## Aufbau

| Pfad | Aufgabe |
|---|---|
| `index.html`, `app.css`, `app.js` | Oberfläche ohne Build-Schritt, Gesprächsansicht, Werkzeugschleife |
| `bibliothek.js` | Ordneraufnahme (auch per Drag & Drop), IndexedDB, Seiten-Rendering |
| `drive.js` | Google Drive: Anmeldung im Browser, Verzeichnis einlesen, Dateien bei Bedarf holen |
| `api/konfig.mjs` | reicht die öffentliche Google-Client-ID an den Browser |
| `werkzeuge-client.js` | führt die Werkzeuge im Browser auf der Bibliothek aus |
| `lib/werkzeuge.mjs` | Werkzeugbeschreibungen (Server und Browser lesen dieselbe Datei) |
| `lib/prompts.mjs` | Modi, Anweisungen, Effort pro Modus – wird auch im Browser geladen |
| `api/chat.mjs` | ein Zug im Gespräch: Anthropic SDK, `claude-opus-5-5`, Streaming als NDJSON |
| `api/pdf.mjs`, `lib/markdown-pdf.mjs` | Markdown → Goodnotes-PDF (pdfkit) |
| `lib/guard.mjs` | Zugangscode, Ratenbegrenzung, Größengrenze |
| `sw.js`, `manifest.webmanifest` | installierbar, Offline-Hülle, Share Target |

## Lokal starten

```bash
cd goodnotes-bridge
npm install
npm run dev:mock                         # ohne API-Schlüssel: Claude wird simuliert
ANTHROPIC_API_KEY=sk-ant-… npm run dev   # echt
npm test                                 # 60 Prüfungen
```

## Auf Vercel veröffentlichen

1. Neues Vercel-Projekt aus diesem Repository, **Root Directory: `goodnotes-bridge`**, Framework „Other“.
2. Umgebungsvariablen:
   - `ANTHROPIC_API_KEY` – Schlüssel von console.anthropic.com
   - `BRIDGE_PASSCODE` – frei gewählter Zugangscode. **Pflicht**: ohne ihn lehnt die Brücke in Produktion
     jede Anfrage ab, damit niemand Fremdes den Schlüssel verbraucht.
   - `GOOGLE_CLIENT_ID` – optional. Ist sie gesetzt, muss die Client-ID nicht im Browser eingetragen werden.
3. Deployen, am iPad in Safari öffnen, *Teilen → Zum Home-Bildschirm*.

Die Website im Repository-Stamm bleibt davon unberührt.

## Grenzen

- Pro Werkzeugaufruf liest Claude höchstens 10 Seiten; bei längeren Notizbüchern ruft es mehrmals auf.
- Ein Durchgang ist auf 40 Werkzeugrunden begrenzt, damit eine zu weite Frage nicht die halbe Bibliothek liest.
- Das PDF nutzt Standardschriften; Emoji und seltene Sonderzeichen werden ersetzt (→ wird zu „->“).
- Gespräche und erzeugte Antworten liegen nur im Browser des Geräts.

## Google Drive einrichten

1. **Goodnotes:** Menü → *Cloud & Backup* → *Automatisches Backup* → Google Drive, Format **PDF**.
2. **Google Cloud Console** (console.cloud.google.com), einmalig:
   - Projekt anlegen, unter *APIs & Dienste* die **Google Drive API** aktivieren.
   - *OAuth-Zustimmungsbildschirm*: extern, eigene Mailadresse als Testnutzer eintragen.
   - *Anmeldedaten → OAuth-Client-ID → Webanwendung*: als autorisierte JavaScript-Herkunft die Adresse
     der App eintragen (z. B. `https://…vercel.app`), speichern, Client-ID kopieren.
3. **In der App:** „Google Drive“ → Client-ID einsetzen → anmelden → Backup-Ordner wählen.

Der Zugriff läuft allein im Browser mit dem Bereich `drive.readonly`; der Server sieht weder Token noch Dateien.
