/* ══════════════════════════════════════════════════════════════
   /api/akquise-antworten-sync – Kundenantworten aus Gmail holen
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 (Phase 6B).

   Zwei Aufgaben, beide bewusst hier und nicht im Browser:

     `sync`    – Gespräche abfragen und neue Antworten importieren
     `gelesen` – eine Antwort als gelesen markieren

   Warum auch das Markieren? Weil dabei der Zähler der Firma
   mitgeführt werden muss. Läge das im Browser, gäbe es zwei
   Schreibvorgänge ohne Zusammenhang – und bei einem Abbruch
   dazwischen stünde die Antwort auf „gelesen", während die Firma
   weiter eine ungelesene meldet.

   Die Gmail-Zugangsdaten liegen ausschließlich als
   Umgebungsvariablen bei Vercel. Der Browser sieht sie nie.
   ══════════════════════════════════════════════════════════════ */

import { pruefeAnmeldung, ratenGrenze, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { ROLLE_ADMIN, ROLLE_AKQUISE } from '../lib/rollen.mjs';
import { gmailEingerichtet } from '../lib/gmail.mjs';
import { synchronisiereAntworten, antwortAlsGelesen } from '../lib/antworten.mjs';

/* Gmail zählt Abfragen gegen ein Kontingent, und häufiger als alle
   paar Minuten kommt ohnehin nichts Neues. Sechs Läufe je Stunde
   und Benutzer sind reichlich – dazu kommt der nächtliche Lauf,
   der ohne Zutun arbeitet. */
const SYNC_JE_STUNDE = 6;

export default async function handler(anfrage, antwortObj){
  if(anfrage.method !== 'POST'){
    antwortObj.setHeader('Allow', 'POST');
    return antworte(antwortObj, 405, { fehler:'Nur POST.' });
  }

  try {
    const koerper = await koerperLesen(anfrage);

    const wer = await pruefeAnmeldung(koerper.idToken);
    if(!wer.ok) return antworte(antwortObj, 401, { fehler: wer.grund });
    if(wer.rolle !== ROLLE_ADMIN && wer.rolle !== ROLLE_AKQUISE){
      return antworte(antwortObj, 403, { fehler:'Für diesen Bereich fehlt die Berechtigung.' });
    }

    const aktion = String(koerper.aktion || 'sync');

    // ── Antwort als gelesen markieren ─────────────────────────
    if(aktion === 'gelesen'){
      const antwortId = String(koerper.antwort_id || '').trim();
      if(!antwortId) return antworte(antwortObj, 400, { fehler:'Keine Antwort angegeben.' });

      const ergebnis = await antwortAlsGelesen(antwortId, wer.name || wer.email);
      if(!ergebnis.ok) return antworte(antwortObj, 404, { fehler: ergebnis.grund });
      return antworte(antwortObj, 200, { ok:true, unveraendert: !!ergebnis.unveraendert });
    }

    if(aktion !== 'sync') return antworte(antwortObj, 400, { fehler:'Unbekannte Aktion.' });

    // ── Abgleich mit Gmail ────────────────────────────────────
    if(!gmailEingerichtet()){
      return antworte(antwortObj, 503, {
        fehler:'Das Akquise-Postfach ist noch nicht eingerichtet. Siehe EINRICHTUNG.md, Abschnitt Gmail.' });
    }

    const grenze = await ratenGrenze('akqantworten:' + wer.uid, SYNC_JE_STUNDE, 60);
    if(!grenze.ok){
      return antworte(antwortObj, 429, {
        fehler:'Die Antworten wurden gerade erst abgerufen. Bitte später erneut versuchen – ' +
               'neue Antworten kommen ohnehin automatisch dazu.' });
    }

    const bericht = await synchronisiereAntworten();
    return antworte(antwortObj, 200, { ok:true, ...bericht });

  } catch(err){
    console.error('/api/akquise-antworten-sync:', err);
    return antworte(antwortObj, 500, { fehler:'Unerwarteter Fehler beim Abgleich.' });
  }
}
