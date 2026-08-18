/* ══════════════════════════════════════════════════════════════
   /api/kunden-nummer – Firmenkundennummer für einen Bestandskunden
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 (Phase 8A).

   Über die Akquise übernommene Leads bekommen ihre Nummer bei der
   Übernahme. Kunden, die vorher schon da waren, haben keine – dieser
   Endpunkt trägt sie nach.

   ⚠️ Nur der Verwalter. Die Akquise-Rolle hat mit der Kundenkartei
   nichts zu tun; sie darf sie nicht lesen und erst recht keine
   Nummern darin vergeben. Diese Phase erweitert keine Rechte.

   Die Vergabe läuft über dieselbe Stelle wie bei der Übernahme
   (`naechsteKundennummer`), damit es nicht zwei Nummernquellen gibt.
   ══════════════════════════════════════════════════════════════ */

import { pruefeVerwalter, ratenGrenze, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { nummerFuerKunde } from '../lib/kunden.mjs';

export default async function handler(anfrage, antwortObj){
  if(anfrage.method !== 'POST'){
    antwortObj.setHeader('Allow', 'POST');
    return antworte(antwortObj, 405, { fehler:'Nur POST.' });
  }

  try {
    const koerper = await koerperLesen(anfrage);

    /* `pruefeVerwalter` und nicht `pruefeAnmeldung`: Hier kommt
       ausschließlich der Verwalter durch. */
    const wer = await pruefeVerwalter(koerper.idToken);
    if(!wer.ok) return antworte(antwortObj, 401, { fehler: wer.grund });

    const grenze = await ratenGrenze('kundennummer:' + wer.uid, 60, 60);
    if(!grenze.ok) return antworte(antwortObj, 429, { fehler:'Zu viele Anfragen. Bitte später erneut.' });

    const dokId = String(koerper.kunden_dokument_id || '').trim();
    if(!dokId) return antworte(antwortObj, 400, { fehler:'Keine Kundenkarte angegeben.' });

    const ergebnis = await nummerFuerKunde(dokId);
    if(!ergebnis.ok) return antworte(antwortObj, 400, { fehler: ergebnis.grund });

    return antworte(antwortObj, 200, ergebnis);

  } catch(err){
    console.error('/api/kunden-nummer:', err);
    return antworte(antwortObj, 500, { fehler:'Unerwarteter Fehler bei der Nummernvergabe.' });
  }
}
