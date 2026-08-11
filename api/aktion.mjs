/* ══════════════════════════════════════════════════════════════
   /api/aktion – Kundenaktionen prüfen und bestätigen
   ══════════════════════════════════════════════════════════════
   Zwei Betriebsarten, beide über POST:

     { schritt: 'ansehen' }     → zeigt, worum es geht. Ändert nichts
                                  Verbindliches.
     { schritt: 'bestaetigen' } → führt die Aktion aus. Verbraucht
                                  das Token.

   ⚠️ GET wird mit 405 abgewiesen. Das ist der Schutz gegen
   Linkscanner: Virenscanner, Vorschaudienste und
   Sicherheitsgateways rufen jeden Link in einer eingehenden Mail
   auf – aber sie tun das mit GET. Ein Scanner kann hier also
   nichts auslösen, selbst wenn er der Weiterleitung folgt.

   Der Token kommt aus dem Adress-Fragment der Seite und wird von
   dort per POST geschickt. Er steht damit in keiner Serverliste,
   in keinem Verweis-Kopf und in keinem Browserverlauf-Eintrag,
   der geteilt würde.
   ══════════════════════════════════════════════════════════════ */

import { holen, aendern, anlegen, jetztIso } from '../lib/firestore.mjs';
import { tokenPruefen, tokenVerbrauchen, ratenGrenze, absenderKennung,
         antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { versende } from '../lib/mail.mjs';
import { bestaetigung, meldungAnAdmin } from '../lib/vorlagen.mjs';

/* Welche Aktion führt zu welchem Stand, und braucht sie eine
   Nachricht des Kunden? An einer Stelle, damit Prüfung, Anzeige und
   Ausführung nicht auseinanderlaufen. */
const AKTIONEN = {
  termin:          { status:'MEETING_BOOKED',   titel:'Besprechungstermin vereinbaren',
                     frage:'Wir melden uns mit Terminvorschlägen bei Ihnen.', textfeld:'optional' },
  vormerken:       { status:'RESERVED',         titel:'14 Tage vormerken',
                     frage:'Wir merken Ihre Kalkulation vor.', textfeld:'nein' },
  aenderung:       { status:'CHANGE_REQUESTED', titel:'Änderung anfragen',
                     frage:'Beschreiben Sie kurz, was geändert werden soll.', textfeld:'pflicht' },
  korrektur:       { status:'CHANGE_REQUESTED', titel:'Angaben korrigieren',
                     frage:'Welche Angaben stimmen nicht?', textfeld:'pflicht' },
  kein_interesse:  { status:'DECLINED',         titel:'Kein Interesse',
                     frage:'Wir schließen den Vorgang ab und melden uns nicht weiter.', textfeld:'optional' },
  neue_kalkulation:{ status:null,               titel:'Neue Kalkulation anfragen',
                     frage:'Wir erstellen Ihnen eine aktualisierte Kalkulation.', textfeld:'optional' },
  kein_kontakt:    { status:'DECLINED',         titel:'Kein weiterer Kontakt',
                     frage:'Wir nehmen zu diesem Vorgang keinen weiteren Kontakt auf.', textfeld:'nein' },
};

/* Was der Kunde sehen darf. Gezielt Feld für Feld – die Kalkulation
   enthält die Kostenseite (Gewinn, Marge, Stundenkosten), und eine
   Schleife über alle Felder gäbe sie heraus. */
function fuerKunden(vk){
  const k = vk.kalkulation || {};
  return {
    nummer: vk.nummer,
    version: vk.version,
    name: [vk.vorname, vk.nachname].filter(Boolean).join(' '),
    firma: vk.firma || null,
    leistungen: vk.leistungen_text || null,
    brutto_gesamt_cent: Number(vk.brutto_gesamt_cent) || 0,
    netto_gesamt_cent: Number(vk.netto_gesamt_cent) || 0,
    mwst_cent: Number(k.mwst_cent) || 0,
    mwst_satz: Number(k.mwst_satz) || 0,
    spanne: k.spanne ? { von_cent:k.spanne.von_cent, bis_cent:k.spanne.bis_cent } : null,
    positionen: (k.positionen || []).map(p => ({
      text: p.text, menge: p.menge || null, betrag_cent: p.betrag_cent, hinweis: p.hinweis || null,
    })),
    annahmen: k.annahmen || [],
    besichtigung_noetig: !!(vk.einstufung && vk.einstufung.besichtigung_noetig),
    reserved_until: vk.reserved_until || null,
    status: vk.status,
  };
}

export default async function handler(anfrage, antwort){
  if(anfrage.method !== 'POST'){
    /* Bewusst keine Fehlerseite mit Inhalt: Ein Scanner soll hier
       nichts finden, was er auswerten oder weiterverfolgen könnte. */
    antwort.setHeader('Allow', 'POST');
    return antworte(antwort, 405, { fehler:'Nur POST.' });
  }

  try {
    const koerper = await koerperLesen(anfrage);
    const { token, aktion, schritt, nachricht } = koerper;

    // ── Ratenbegrenzung ───────────────────────────────────────
    const grenze = await ratenGrenze('aktion:' + absenderKennung(anfrage), 20, 10);
    if(!grenze.ok) return antworte(antwort, 429, { fehler: grenze.text });

    if(!AKTIONEN[aktion]) return antworte(antwort, 400, { fehler:'Unbekannte Aktion.' });
    const regel = AKTIONEN[aktion];

    // ── Token prüfen (ohne zu verbrauchen) ────────────────────
    const pruefung = await tokenPruefen(token, aktion);
    if(!pruefung.ok){
      return antworte(antwort, 200, { ok:false, grund: pruefung.grund, text: pruefung.text });
    }
    const eintrag = pruefung.eintrag;

    const vk = await holen('vorkalkulationen', eintrag.dokument_id);
    if(!vk) return antworte(antwort, 200, { ok:false, grund:'weg', text:'Dieser Vorgang ist nicht mehr vorhanden.' });

    /* Veraltete Fassung ablehnen: Wer noch die Mail zu Version 1
       offen hat, während Version 2 schon versendet wurde, darf
       nicht Version 1 bestätigen. */
    if(Number(eintrag.dokument_version) !== Number(vk.version)){
      return antworte(antwort, 200, { ok:false, grund:'veraltet',
        text:'Zu diesem Vorgang gibt es inzwischen eine neuere Fassung. Bitte verwenden Sie die zuletzt erhaltene E-Mail.' });
    }

    // ══════════════════════════════════════════════════════════
    //  SCHRITT 1: nur anzeigen
    // ══════════════════════════════════════════════════════════
    if(schritt !== 'bestaetigen'){
      /* `viewed_at` wird hier gesetzt – das ist der einzige Zustand,
         den das Ansehen ändert, und er ist bewusst folgenlos: Er
         verschiebt keine Frist, löst keine Mail aus und bindet
         niemanden. Nur wenn das Dokument noch unangetastet ist,
         damit ein späteres Ansehen keinen Fortschritt zurückdreht. */
      if(vk.status === 'SENT'){
        await aendern('vorkalkulationen', eintrag.dokument_id, {
          status:'VIEWED', viewed_at: jetztIso(),
        }).catch(err => console.error('viewed_at nicht gesetzt:', err.message));
      }
      return antworte(antwort, 200, {
        ok:true, schritt:'ansehen',
        aktion, titel: regel.titel, frage: regel.frage, textfeld: regel.textfeld,
        dokument: fuerKunden(vk),
      });
    }

    // ══════════════════════════════════════════════════════════
    //  SCHRITT 2: bestätigen
    // ══════════════════════════════════════════════════════════
    if(regel.textfeld === 'pflicht' && !String(nachricht || '').trim()){
      return antworte(antwort, 200, { ok:false, grund:'text_fehlt',
        text:'Bitte beschreiben Sie kurz, worum es geht.' });
    }

    /* Verbrauchen, bevor irgendetwas geschieht. Von zwei
       gleichzeitigen Klicks kommt genau einer durch. */
    const verbrauch = await tokenVerbrauchen(token, aktion);
    if(!verbrauch.ok){
      return antworte(antwort, 200, { ok:false, grund: verbrauch.grund, text: verbrauch.text });
    }

    const statusVorher = vk.status;
    const aenderungen = {};
    let vorgemerktBis = null;

    if(regel.status) aenderungen.status = regel.status;

    if(aktion === 'vormerken'){
      const vorsortierung = await holen('einstellungen', 'vorsortierung');
      const tage = Number((vorsortierung && vorsortierung.vormerkung_tage) || 14);
      vorgemerktBis = new Date(Date.now() + tage * 86400000).toISOString();
      aenderungen.reserved_until = vorgemerktBis;
      aenderungen.reserved_at = jetztIso();
    }
    if(aktion === 'kein_kontakt') aenderungen.kein_kontakt = true;

    aenderungen.letzte_kundenaktion = aktion;
    aenderungen.letzte_kundenaktion_am = jetztIso();

    await aendern('vorkalkulationen', eintrag.dokument_id, aenderungen);

    // ── Protokollieren ────────────────────────────────────────
    const reaktion = await anlegen('kundenreaktionen', {
      aktion,
      dokument_typ:'vorkalkulation',
      dokument_id: eintrag.dokument_id,
      dokument_nummer: vk.nummer,
      dokument_version: Number(vk.version) || 1,
      kunde_key: vk.kunde_key || null,
      kunde_name: [vk.vorname, vk.nachname].filter(Boolean).join(' '),
      kunde_email: vk.email || null,
      nachricht: String(nachricht || '').slice(0, 2000) || null,
      status_vorher: statusVorher,
      status_nachher: aenderungen.status || statusVorher,
      bestaetigt: true,
      erledigt: false,
      zeitpunkt: jetztIso(),
    });

    await anlegen('protokoll', {
      vorgang:'kundenaktion',
      aktion,
      dokument:'vorkalkulation', dokument_id: eintrag.dokument_id,
      nummer: vk.nummer, version: vk.version,
      status_vorher: statusVorher, status_nachher: aenderungen.status || statusVorher,
      reaktion_id: reaktion.id,
      benutzer:'kunde', zeitpunkt: jetztIso(),
    });

    await anlegen('benachrichtigungen', {
      art:'kundenreaktion',
      titel: regel.titel + ' – ' + vk.nummer,
      text: [vk.vorname, vk.nachname].filter(Boolean).join(' '),
      ziel_bereich:'reaktionen', ziel_id: reaktion.id,
      gelesen:false, createdAt: jetztIso(),
    }).catch(err => console.error('Benachrichtigung fehlgeschlagen:', err.message));

    // ── Bestätigung an den Kunden ─────────────────────────────
    /* Schlägt der Mailversand fehl, bleibt die Aktion trotzdem
       gültig – sie ist bereits gebucht und protokolliert. Dem
       Kunden eine Fehlermeldung zu zeigen, nachdem seine Zusage
       gespeichert wurde, wäre falsch. */
    if(vk.email){
      const rechtstexte = await holen('einstellungen', 'rechtstexte').catch(() => null);
      const nachr = bestaetigung(vk, aktion, {
        bis: vorgemerktBis,
        vormerkungHinweis: (rechtstexte && rechtstexte.vormerkung_hinweis) || null,
      });
      await versende({
        an: vk.email, betreff: nachr.betreff, html: nachr.html, text: nachr.text,
        idempotenzSchluessel: `bestaetigung-${eintrag.dokument_id}-${aktion}-v${vk.version || 1}`,
        zweck:'bestaetigung', bezug:{ typ:'vorkalkulation', id: eintrag.dokument_id },
      }).catch(err => console.error('Bestätigungsmail fehlgeschlagen:', err.message));
    }

    // ── Meldung an den Verwalter ──────────────────────────────
    const adminMail = process.env.ADMIN_MAIL || 'waschlurch@gmail.com';
    const meldung = meldungAnAdmin(regel.titel + ' – ' + vk.nummer, [
      ['Kunde', [vk.vorname, vk.nachname].filter(Boolean).join(' ') || '–'],
      ['Vorgang', vk.nummer],
      ['Neuer Stand', aenderungen.status || statusVorher],
      nachricht ? ['Nachricht', String(nachricht).slice(0, 300)] : null,
    ]);
    await versende({
      an: adminMail, betreff: meldung.betreff, html: meldung.html, text: meldung.text,
      idempotenzSchluessel: `admin-${reaktion.id}`,
      zweck:'adminmeldung', bezug:{ typ:'vorkalkulation', id: eintrag.dokument_id },
    }).catch(err => console.error('Meldung an den Verwalter fehlgeschlagen:', err.message));

    return antworte(antwort, 200, {
      ok:true, schritt:'bestaetigt', aktion,
      titel: regel.titel,
      text: aktion === 'vormerken'
        ? 'Ihre Vorabkalkulation ist bis zum ' +
          new Date(vorgemerktBis).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' }) +
          ' vorgemerkt.'
        : regel.frage,
      vorgemerkt_bis: vorgemerktBis,
    });

  } catch(err){
    console.error('Kundenaktion fehlgeschlagen:', err);
    return antworte(antwort, 500, { fehler:'Da ist etwas schiefgegangen. Bitte versuchen Sie es später erneut.' });
  }
}
