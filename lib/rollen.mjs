/* ══════════════════════════════════════════════════════════════
   ROLLEN UND BEREICHSRECHTE
   ══════════════════════════════════════════════════════════════
   Die eine verbindliche Liste, wer was darf. Angelegt am
   14.08.2026 für den Akquise-Zugang.

   Vorher kannte das System genau zwei Zustände: Verwalter oder
   niemand. Die Prüfung stand an drei Stellen gleichlautend im
   Code (Firestore-Regeln, `pruefeVerwalter`, `ADMIN_EMAILS` im
   Dashboard). Für eine zweite Rolle hätte das bedeutet, dieselbe
   Aufzählung ein viertes Mal zu schreiben.

   ⚠️ Diese Datei ist die Liste für den SERVER. Das Dashboard
   führt eine eigene, gleichlautende Liste (`BEREICHE_JE_ROLLE`
   in admin.html) – ohne Bauschritt lässt sich hier keine Datei
   in den Browser importieren.

   Das ist kein Widerspruch zur Regel „eine Quelle": Die Liste im
   Browser entscheidet nur, welche Menüpunkte SICHTBAR sind. Was
   ein Benutzer tatsächlich lesen und schreiben darf, entscheiden
   ausschließlich die Firestore-Regeln und die Prüfungen in
   `sicherheit.mjs`. Läuft die Liste im Browser auseinander, sieht
   jemand einen Menüpunkt zu viel – und läuft dann in eine
   Fehlermeldung. Kein Datenabfluss.

   Deshalb gilt umgekehrt: Eine neue Sammlung mit schutzwürdigen
   Daten wird NIE allein über diese Datei freigegeben. Sie braucht
   immer zusätzlich eine Firestore-Regel.
   ══════════════════════════════════════════════════════════════ */

export const ROLLE_ADMIN    = 'admin';
export const ROLLE_AKQUISE  = 'acquisition';   // Social Media & Akquise

export const ROLLEN = [ROLLE_ADMIN, ROLLE_AKQUISE];

export const ROLLEN_TEXT = {
  [ROLLE_ADMIN]:   'Verwalter (Vollzugriff)',
  [ROLLE_AKQUISE]: 'Social Media & Akquise',
};

/* Bereiche des Dashboards je Rolle.

   `'*'` steht für „alles" und ist bewusst nur beim Verwalter
   gesetzt: Kommt später ein Bereich hinzu, sieht ihn der
   Verwalter sofort, ein Akquise-Mitarbeiter dagegen erst, wenn
   er hier ausdrücklich eingetragen wird. Ein vergessener Eintrag
   sperrt also aus, statt versehentlich freizugeben. */
export const BEREICHE_JE_ROLLE = {
  [ROLLE_ADMIN]: '*',
  [ROLLE_AKQUISE]: [
    'akquise',           // Startbildschirm mit Fortschritt und Kennzahlen
    'akquise_firmen',    // Firmen- und Leadliste
    'akquise_mails',     // vorbereitete und versendete Nachrichten
    'akquise_antworten', // eingegangene Antworten
  ],
};

/* Sammlungen, die eine Rolle überhaupt anfassen darf. Dient der
   Prüfung in den Serverfunktionen; die Firestore-Regeln setzen
   dasselbe noch einmal unabhängig durch.

   ⚠️ `kunden` steht hier bewusst NICHT.

   Aus einem interessierten Lead soll später eine ganz normale
   Kundenkarteikarte entstehen – eine zweite, parallele
   Kundenverwaltung wäre der sichere Weg in zwei Datenbestände, die
   auseinanderlaufen. Aber „darf eine Karteikarte anlegen" ist etwas
   anderes als „darf die Kundensammlung lesen". Stünde `kunden` in
   dieser Liste, hätte eine Serverfunktion mit
   `pruefeZugriff(token, 'kunden')` der Akquise-Rolle den Blick auf
   alle Bestandskunden samt Anschriften und Notizen geöffnet.

   Die Übernahme bekommt deshalb in der nächsten Ausbaustufe einen
   eigenen, eng geschnittenen Endpunkt, der genau ein Dokument aus
   genau einem Lead anlegt. */
export const SAMMLUNGEN_JE_ROLLE = {
  [ROLLE_ADMIN]: '*',
  [ROLLE_AKQUISE]: [
    'firmen',
    'akquise_nachrichten',
    'akquise_verlauf',
  ],
};

export function darfBereich(rolle, bereich){
  const erlaubt = BEREICHE_JE_ROLLE[rolle];
  if(!erlaubt) return false;
  return erlaubt === '*' || erlaubt.includes(bereich);
}

export function darfSammlung(rolle, sammlung){
  const erlaubt = SAMMLUNGEN_JE_ROLLE[rolle];
  if(!erlaubt) return false;
  return erlaubt === '*' || erlaubt.includes(sammlung);
}

export function istBekannteRolle(rolle){
  return ROLLEN.includes(rolle);
}
