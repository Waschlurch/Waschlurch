# Einrichtung des automatischen Versands

Diese Anleitung richtet den automatischen E-Mail-Versand und den nächtlichen
Ablaufjob ein. **Alles läuft über Web-Oberflächen – keine Kommandozeile.**

Bis das eingerichtet ist, funktioniert das Dashboard vollständig: Anfragen werden
eingestuft, Vorabkalkulationen berechnet, geprüft und freigegeben, PDFs erzeugt.
Nur der Versandknopf meldet dann, dass die Einrichtung noch fehlt. Du kannst in
der Zwischenzeit über **Vorschau** das PDF holen und wie bisher von Hand senden.

---

## Warum das nötig ist

Drei Dinge kann ein Browser prinzipiell nicht leisten:

1. **Einen Link prüfen, ohne dass der Kunde angemeldet ist.** Läge die Prüfung im
   Browser des Kunden, könnte er sie mit dem Entwicklerwerkzeug abschalten und
   jede beliebige Kalkulation öffnen.
2. **Nachts um sechs etwas tun.** Browsercode läuft nur, solange jemand die Seite
   offen hat. Erinnerungs- und Ablaufmails kämen also nur, wenn du zufällig das
   Dashboard geöffnet hast.
3. **Ein Passwort geheim halten.** Alles, was im Browser steht, kann jeder lesen,
   der die Seite aufruft.

Deshalb liegen drei kleine Programme im Ordner `api/`. Vercel führt sie auf
seinen Servern aus, nicht im Browser.

---

## Schritt 1 – Firebase-Dienstkonto erzeugen

Das ist der Schlüssel, mit dem die Serverprogramme in die Datenbank schreiben dürfen.

1. Öffne https://console.firebase.google.com/project/waschlurch-469d4/settings/serviceaccounts/adminsdk
2. Klicke auf **Neuen privaten Schlüssel generieren** und bestätige mit **Schlüssel generieren**.
3. Es lädt eine Datei herunter, die etwa `waschlurch-469d4-abc123.json` heißt.
4. Öffne die Datei mit dem Editor (Rechtsklick → Öffnen mit → Editor).
5. Markiere **den gesamten Inhalt** (Strg+A) und kopiere ihn (Strg+C).

> ⚠️ Diese Datei ist wie ein Generalschlüssel zur Datenbank.
> **Niemals ins GitHub-Repo hochladen.** Nur in Vercel einfügen (Schritt 3).
> Nach dem Einfügen kannst du sie vom Rechner löschen.

---

## Schritt 2 – Postausgang einrichten (Resend)

Resend verschickt die E-Mails. Kostenlos bis 3.000 Mails im Monat – bei deinem
Aufkommen reicht das weit.

1. Konto anlegen auf https://resend.com/signup
2. Links auf **Domains** → **Add Domain** → `waschlurch.com` eintragen.
3. Resend zeigt dir drei bis vier Einträge (DKIM, SPF). Die musst du bei deinem
   Domain-Anbieter eintragen – dort, wo du auch die Vercel-Einstellungen gemacht hast.
   Suche nach **DNS** oder **DNS-Einträge verwalten** und trage jeden Eintrag
   einzeln ein (Typ, Name, Wert genau übernehmen).
4. Zurück bei Resend auf **Verify DNS Records**. Das kann bis zu einer Stunde dauern.
5. Wenn die Domain grün ist: links auf **API Keys** → **Create API Key**,
   Name `waschlurch-versand`, Berechtigung **Sending access**.
6. Den Schlüssel kopieren (beginnt mit `re_`). **Er wird nur einmal angezeigt.**

> Ohne verifizierte Domain landen die Mails im Spam oder werden abgelehnt.
> Der Schritt ist unangenehm, aber er entscheidet darüber, ob deine Angebote ankommen.

---

## Schritt 3 – Werte in Vercel eintragen

1. Öffne https://vercel.com/dashboard und wähle das Projekt **Waschlurch**.
2. Oben auf **Settings**, links auf **Environment Variables**.
3. Trage nacheinander diese vier Werte ein. Bei jedem alle drei Häkchen
   (Production, Preview, Development) gesetzt lassen und auf **Save** klicken.

| Name | Wert |
|---|---|
| `FIREBASE_DIENSTKONTO` | Der komplette Inhalt der JSON-Datei aus Schritt 1 |
| `RESEND_KEY` | Der Schlüssel aus Schritt 2, beginnt mit `re_` |
| `ABSENDER_MAIL` | `angebote@waschlurch.com` |
| `AKTION_GEHEIMNIS` | Eine lange zufällige Zeichenfolge – siehe unten |

**`AKTION_GEHEIMNIS` erzeugen:** Öffne https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&format=plain&rnd=new
und kopiere die angezeigte Zeile. Sie muss niemandem bekannt sein und wird nie
irgendwo angezeigt.

---

## Schritt 4 – Nächtlichen Lauf einschalten

Das ist bereits in `vercel.json` eingetragen. Beim nächsten Commit auf `main`
richtet Vercel den Lauf automatisch ein: **jeden Tag um 6:00 Uhr**.

Er tut genau drei Dinge:

- Vorabkalkulationen, deren Vormerkung in drei Tagen endet → Erinnerungsmail
- Vorabkalkulationen, deren Vormerkung abgelaufen ist → Status auf „abgelaufen“, Ablaufmail
- Verbindliche Angebote, deren Gültigkeit abgelaufen ist → Status auf „abgelaufen“

Er vergibt **keine Nummern**, bucht **kein Geld** und löscht **nichts**.
Jeder Lauf schreibt eine Marke in `automatik_laeufe`; läuft er versehentlich
zweimal, passiert beim zweiten Mal nichts.

---

## Schritt 5 – Prüfen, ob es geht

1. Warte, bis Vercel fertig deployt hat (grüner Haken im Dashboard).
2. Öffne https://waschlurch.com/admin.html und melde dich an.
3. Gehe auf **Anfragen**, wähle eine Anfrage, klicke **Vorabkalkulation anlegen**.
4. Gehe auf **Vorabkalkulationen**, prüfe die Zahlen, klicke **Freigeben**.
5. Klicke **Freigegeben – jetzt versenden**. Trage vorher testweise deine eigene
   E-Mail-Adresse als Empfänger ein.
6. Du solltest binnen einer Minute eine Mail mit fünf Knöpfen bekommen.
7. Klicke einen Knopf an: Es öffnet sich eine Bestätigungsseite. **Erst der Knopf
   auf dieser Seite** löst die Aktion aus – der Mail-Knopf allein tut nichts.
   Das ist Absicht: Virenscanner und Mailprogramme öffnen Links automatisch.
8. Nach der Bestätigung erscheint die Reaktion unter **Kundenreaktionen**.

---

## Wenn etwas nicht klappt

| Meldung | Ursache | Lösung |
|---|---|---|
| „Der automatische Versand ist noch nicht eingerichtet" | Die Dateien im Ordner `api/` fehlen im Repo | Ordner `api/` mit allen Dateien hochladen, **Commit directly to the main branch** wählen |
| „Server meldete 500" | Ein Wert in Vercel fehlt oder ist falsch kopiert | Settings → Environment Variables prüfen, besonders `FIREBASE_DIENSTKONTO` (muss mit `{` beginnen und mit `}` enden) |
| „Server meldete 401" | Deine Anmeldung ist abgelaufen | Im Dashboard abmelden und neu anmelden |
| Mail kommt nicht an | Domain bei Resend noch nicht verifiziert | Resend → Domains, Status prüfen |
| Mail landet im Spam | DNS-Einträge unvollständig | Alle von Resend genannten Einträge eintragen, auch SPF |

Logs findest du in Vercel unter **Deployments → der oberste Eintrag → Functions**.

---

## Was du NICHT tun musst

- Keine Kommandozeile, kein `npm`, kein Git auf dem Rechner.
- Keine Abhängigkeiten installieren – die Serverprogramme kommen ohne aus.
- Nichts an den bestehenden Dateien ändern.

## Verwandte Seiten

- [[Deployment]]
- [[Projektdokumentation]]
- [[Dashboard]]
