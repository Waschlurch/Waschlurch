# Ink Bridge – Goodnotes ⇄ Claude

Web-App (PWA) als Brücke zwischen Goodnotes und Claude:

1. **Goodnotes → Claude:** Seiten als PDF/Bild aus Goodnotes exportieren und ablegen (Datei, Drag & Drop, Split View am iPad, Einfügen, auf Android auch „Teilen an“).
2. **Claude arbeitet:** Transkribieren · Zusammenfassen · Aufgaben · Lernkarten · Ausarbeiten · Frei fragen · Neue Seite. Die Antwort kommt live (Streaming), lässt sich bearbeiten und kopieren.
3. **Claude → Goodnotes:** Ein Goodnotes-fertiges PDF (liniert/Punkte/kariert/blanko, Weiß/Creme/Dunkel, A4/iPad/Letter/quer, mit Notizrand für Handschrift). **An Goodnotes senden** öffnet am iPad das Teilen-Menü, dort „Goodnotes“ wählen.

Goodnotes hat keine öffentliche API. Die Brücke läuft deshalb über Export und Import, so wie Goodnotes Dateien selbst austauscht.

## Aufbau

| Pfad | Aufgabe |
|---|---|
| `index.html`, `app.css`, `app.js` | Oberfläche ohne Build-Schritt; große PDFs werden im Browser mit pdf.js in Seitenbilder zerlegt und verdichtet |
| `api/claude.mjs` | Anthropic SDK, Modell `claude-opus-5-5`, Streaming als NDJSON, serverseitige Fallbacks bei Ablehnungen |
| `api/pdf.mjs`, `lib/markdown-pdf.mjs` | Markdown → PDF (pdfkit) |
| `lib/prompts.mjs` | Modi, Anweisungen, Effort pro Modus |
| `lib/guard.mjs` | Zugangscode, Ratenbegrenzung, Größenlimit |
| `sw.js`, `manifest.webmanifest` | Installierbar, Offline-Hülle, Share Target |

## Lokal starten

```bash
cd goodnotes-bridge
npm install
npm run dev:mock                         # ohne API-Schlüssel, Claude wird simuliert
ANTHROPIC_API_KEY=sk-ant-… npm run dev   # echt
npm test                                 # 52 Prüfungen
```

## Auf Vercel veröffentlichen

1. In Vercel ein **neues Projekt** aus diesem Repository anlegen, **Root Directory: `goodnotes-bridge`**, Framework „Other“.
2. Umgebungsvariablen setzen:
   - `ANTHROPIC_API_KEY`: Schlüssel von console.anthropic.com
   - `BRIDGE_PASSCODE`: frei gewählter Zugangscode. **Pflicht**: Ohne ihn lehnt die Brücke in Produktion jede Anfrage ab, damit niemand Fremdes deinen Schlüssel verbraucht.
3. Deployen, am iPad in Safari öffnen, *Teilen → Zum Home-Bildschirm*.

Die bestehende Website im Repository-Stamm bleibt davon unberührt.

## Grenzen

- Pro Durchgang höchstens 20 Seiten und rund 3 MB, bedingt durch Vercels Anfragelimit. Große Notizbücher werden automatisch in Seitenbilder umgewandelt und verdichtet.
- Das PDF nutzt Standardschriften. Emoji und seltene Sonderzeichen werden ersetzt (→ wird zu „->“).
- Der Verlauf liegt nur im Browser des Geräts. Hochgeladene Dateien werden nirgends gespeichert.
