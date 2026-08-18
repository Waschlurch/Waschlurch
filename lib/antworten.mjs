/* ══════════════════════════════════════════════════════════════
   KUNDENANTWORTEN AUS GMAIL EINSAMMELN
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 (Phase 6B).

   Der Ablauf, den Lukas nie sehen muss:

     Waschlurch sendet ──▶ Kunde antwortet ──▶ dieser Lauf liest die
     Antwort ──▶ Zuordnung über `gmail_thread_id` ──▶ sie steht unter
     „Akquise → Antworten".

   ⚠️ Es wird NIE das Postfach durchsucht. Abgefragt werden
   ausschließlich Gespräche, die Waschlurch selbst begonnen hat.
   Eine private Mail an dieselbe Adresse kann dadurch gar nicht erst
   in die Nähe des Dashboards kommen – das ist keine Filterregel,
   die jemand vergessen könnte, sondern eine Eigenschaft des Wegs.

   Diese Datei wird von zwei Stellen benutzt: vom nächtlichen Lauf
   (`api/taeglich.mjs`) und vom Knopf „Antworten aktualisieren"
   (`api/akquise-antworten-sync.mjs`). Deshalb liegt sie hier und
   nicht in einer der beiden.
   ══════════════════════════════════════════════════════════════ */

import { suchen, holen, aendern, anlegen, nurNeu, jetztIso } from './firestore.mjs';
import { holeGespraech, antwortenAusGespraech, gmailAbsender } from './gmail.mjs';

/* Nur Firmen, bei denen eine Antwort überhaupt in Frage kommt.
   `wartet` = Mail ist raus, noch nichts zurück.
   `neu`    = es kam schon etwas, es kann mehr kommen. */
const OFFENE_ZUSTAENDE = ['wartet', 'neu'];

/* Ein abgeschlossener Vorgang wird durch eine späte Antwort nicht
   wieder aufgemacht. Die Antwort wird trotzdem gespeichert – sie
   kann ja das „bitte nicht mehr schreiben" sein –, aber der Status
   bleibt, wo er ist. */
const ABGESCHLOSSEN = ['kunde', 'kein_interesse', 'nicht_kontaktieren'];

export async function synchronisiereAntworten(){
  const bericht = { gespraeche:0, neue_antworten:0, schon_bekannt:0, fehler:0, firmen:[] };

  const firmen = [];
  for(const zustand of OFFENE_ZUSTAENDE){
    const treffer = await suchen('firmen', [['antwort_status', 'EQUAL', zustand]], 300);
    treffer.forEach(f => { if(!firmen.some(x => x.id === f.id)) firmen.push(f); });
  }

  const eigen = gmailAbsender();

  for(const firma of firmen){
    if(!firma.gmail_thread_id) continue;
    bericht.gespraeche++;

    let gespraech = null;
    try {
      gespraech = await holeGespraech(firma.gmail_thread_id);
    } catch(err){
      /* Ein gestörtes Gespräch darf den Lauf nicht abbrechen – die
         übrigen Firmen haben damit nichts zu tun. */
      console.error('Gespräch ' + firma.gmail_thread_id + ' nicht lesbar:', err.message);
      bericht.fehler++;
      continue;
    }
    if(!gespraech) continue;   // gelöscht – kein Fehler

    const antworten = antwortenAusGespraech(gespraech, eigen);
    if(antworten.length === 0) continue;

    /* Die zugehörige versendete Nachricht – für die Verknüpfung im
       Datensatz. Einmal je Firma, nicht je Antwort. */
    let nachrichtId = null;
    try {
      const nachrichten = await suchen('akquise_nachrichten',
        [['gmail_thread_id', 'EQUAL', firma.gmail_thread_id]], 5);
      if(nachrichten.length) nachrichtId = nachrichten[0].id;
    } catch(err){ console.error('Nachricht zum Gespräch nicht gefunden:', err.message); }

    let neueDieseFirma = 0;
    let letzte = firma.letzte_antwort_am || null;

    for(const a of antworten){
      /* ⚠️ Die Gmail-Kennung IST die Dokumentkennung. Damit kann
         dieselbe Nachricht nicht zweimal ankommen – auch nicht bei
         zwei gleichzeitigen Läufen, denn Firestore lässt ein
         zweites `create` auf dieselbe Kennung nicht zu. Eine
         Prüfung „gibt es das schon?" wäre hier zu wenig: Zwischen
         Lesen und Schreiben passt der zweite Lauf hindurch. */
      const frisch = await nurNeu('akquise_antworten', a.gmail_message_id, {
        firma_id: firma.id,
        firma_name: firma.firmenname || '',
        nachricht_id: nachrichtId,
        gmail_message_id: a.gmail_message_id,
        gmail_thread_id: a.gmail_thread_id,
        rfc_message_id: a.rfc_message_id || '',
        /* Seit Phase 6C stehen eingehende und ausgehende Nachrichten
           in derselben Sammlung – daraus entsteht der Gesprächsverlauf.
           Altbestände ohne das Feld gelten als eingehend. */
        richtung: 'eingehend',
        absender: a.absender,
        absender_name: a.absender_name || '',
        empfaenger: a.empfaenger,
        betreff: a.betreff,
        text: a.text,
        empfangen_am: a.empfangen_am,
        gelesen: false,
        importiert_am: jetztIso(),
      });

      if(!frisch){ bericht.schon_bekannt++; continue; }

      bericht.neue_antworten++;
      neueDieseFirma++;
      if(!letzte || a.empfangen_am > letzte) letzte = a.empfangen_am;
    }

    if(neueDieseFirma === 0) continue;

    /* Der Zähler wird hochgezählt, nicht neu gesetzt: Eine bereits
       gelesene Antwort darf durch einen neuen Lauf nicht wieder
       ungelesen werden. */
    const aenderung = {
      antwort_status: 'neu',
      ungelesene_antworten: (Number(firma.ungelesene_antworten) || 0) + neueDieseFirma,
      letzte_antwort_am: letzte,
      aktualisiert_am: jetztIso(),
    };
    /* ⚠️ Ein abgeschlossener oder gesperrter Vorgang wird nicht
       wieder auf „Antwort" gedreht. Sonst stünde eine abgesagte
       Firma nach einer Abwesenheitsnotiz wieder in den offenen
       Aufgaben – und jemand schriebe zurück. */
    if(!ABGESCHLOSSEN.includes(firma.status) && firma.do_not_contact !== true){
      aenderung.status = 'antwort';
    }

    try {
      await aendern('firmen', firma.id, aenderung);
    } catch(err){ console.error('Firmenstatus nach Antwort nicht gesetzt:', err.message); }

    try {
      await anlegen('akquise_verlauf', {
        firma_id: firma.id,
        benutzer_uid: 'system',
        benutzer_name: 'Automatischer Abgleich',
        ereignis: 'antwort',
        beschreibung: neueDieseFirma === 1
          ? 'Kundenantwort eingegangen'
          : neueDieseFirma + ' Kundenantworten eingegangen',
        createdAt: jetztIso(),
      });
    } catch(err){ console.error('Verlaufseintrag zur Antwort fehlgeschlagen:', err.message); }

    bericht.firmen.push({ id: firma.id, name: firma.firmenname || '', neu: neueDieseFirma });
  }

  return bericht;
}

/* Wird beim Öffnen einer Antwort gebraucht. Steht hier, weil der
   Zähler der Firma dabei mitgeführt werden muss – und niemand soll
   das an zwei Stellen nachbauen. */
export async function antwortAlsGelesen(antwortId, werName){
  const antwort = await holen('akquise_antworten', antwortId);
  if(!antwort) return { ok:false, grund:'Diese Antwort gibt es nicht (mehr).' };
  if(antwort.gelesen === true) return { ok:true, unveraendert:true };

  await aendern('akquise_antworten', antwortId, {
    gelesen: true, gelesen_am: jetztIso(), gelesen_von: werName || '',
  });

  const firma = await holen('firmen', antwort.firma_id);
  if(firma){
    /* Nie unter null. Ein Zähler, der ins Minus läuft, wäre für
       immer falsch – und die Kennzahl auf der Startseite mit ihm. */
    const offen = Math.max(0, (Number(firma.ungelesene_antworten) || 0) - 1);
    await aendern('firmen', antwort.firma_id, {
      ungelesene_antworten: offen,
      antwort_status: offen > 0 ? 'neu' : 'gelesen',
      aktualisiert_am: jetztIso(),
    });
  }
  return { ok:true };
}
