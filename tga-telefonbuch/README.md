# TGA Telefonbuch – Prototyp

Klickbarer Prototyp eines internen Telefonbuchs für ein TGA-Ingenieurbüro.
Gefüllt mit realistischen Demo-Daten eines fiktiven Büros im Rhein-Sieg-Kreis.

## Starten

```bash
cd tga-telefonbuch
npm install
npm run dev
```

Dann <http://localhost:3000> öffnen.

Für die Offline-Funktion (Service Worker) den gebauten Stand nutzen:

```bash
npm run build && npm start
```

## Was enthalten ist

| Seite | Pfad | Inhalt |
| --- | --- | --- |
| Dashboard | `/` | Große Suche, Favoriten, zuletzt verwendet, Kategorien, Sync-Status |
| Kontaktliste | `/kontakte` | Filter nach Kategorie und Favoriten, A–Z-Gruppierung |
| Kontaktdetail | `/kontakte/[id]` | Anrufen, Mobil, E-Mail, WhatsApp, Navigation, Kopieren, Favorit, Bearbeiten |
| Firmenansicht | `/firmen`, `/firmen/[id]` | Ansprechpartner, Firmendaten, zugehörige Projekte |
| Projektansicht | `/projekte`, `/projekte/[id]` | Projektbeteiligte nach Rolle, direkt anklickbar |
| Administration | `/admin` | Kontakte, Firmen, Kategorien, CSV-Import, Berechtigungen |
| Mehr (mobil) | `/mehr` | Rolle, Sync, Verwaltung, Kategorien |
| Download | `/download` | Windows, Android, Browser, iPhone – Version und Stand |

Auf dem Handy führt eine Bottom-Navigation durch Start, Kontakte, Firmen,
Projekte und Mehr; die Detailseite hat große Aktionsflächen für den Daumen.

## Suche

Ein Feld durchsucht Name, Firma, Position, Bereich, Telefonnummer (auch ohne
Leerzeichen), E-Mail, Ort, Projektnummer, Projektname und Branche. Mehrere
Begriffe werden UND-verknüpft, Umlaute sind egal. `Strg`/`Cmd` + `K` springt in
die Suche.

## Offline und Synchronisierung

- Alle Daten liegen im **LocalStorage** des Geräts und überstehen ein Neuladen.
- Ein **Service Worker** cacht die Anwendung selbst; nach dem ersten Besuch
  startet sie auch ohne Netz (nur im gebauten Stand aktiv).
- Der Status oben rechts zeigt „Online – Kontakte synchronisiert“ bzw.
  „Offline – letzte Synchronisierung …“. Über **Offline simulieren** lässt sich
  der Fall ohne echtes Trennen der Verbindung vorführen.
- Jede Änderung erhöht einen Zähler offener Änderungen; beim Abgleich (manuell
  oder beim Zurückkommen ins Netz) wird er zurückgesetzt.

Der Abgleich ist **simuliert** – es gibt noch keine zentrale Datenbank.

## Berechtigungen

Zwei Rollen, umschaltbar unter `/admin` → Berechtigungen oder unter `/mehr`:

- **Administrator** – anlegen, bearbeiten, löschen, importieren
- **Mitarbeiter** – nur ansehen, suchen, anrufen, Favoriten setzen

## CSV-Import

Unter `/admin` → Import. Datei auswählen oder Zeilen aus Excel einfügen;
Semikolon, Komma und Tabulator werden erkannt. Die Spaltenreihenfolge ist egal,
erkannt wird über die Überschrift (`Vorname`, `Nachname`, `Firma`, `Position`,
`Bereich`, `Kategorie`, `Festnetz`, `Durchwahl`, `Mobil`, `E-Mail`, `Straße`,
`PLZ`, `Ort`, `Notizen`). Unbekannte Firmen werden automatisch angelegt.
„Beispiel einfügen“ zeigt das erwartete Format.

## Technik

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
lucide-react. Kein Backend, keine Cloud.

```
app/        Seiten (Dashboard, Kontakte, Firmen, Projekte, Admin, Mehr, Download)
components/ Shell, Suche, Listen, Formulare, Bausteine
lib/        Datenmodell, Demo-Daten, Store mit LocalStorage, Suche, CSV
public/sw.js Offline-Cache
```

## Demo zurücksetzen

`/admin` → Berechtigungen → **Zurücksetzen** stellt die Demo-Daten wieder her.

## Nächste Schritte

- Zentrale Datenbank mit Benutzerverwaltung anbinden
- Echten Abgleich mit Konfliktbehandlung statt der Simulation
- Verpackung als Windows-Anwendung und Android-App
