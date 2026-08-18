/* ══════════════════════════════════════════════════════════════
   /api/akquise-antwort-senden – im bestehenden Gespräch antworten
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 (Phase 6C).

   ⚠️ Der Browser schickt NUR zwei Kennungen und den geschriebenen
   Text. Empfänger, Betreff und Gesprächskennung liest diese
   Funktion selbst aus der Datenbank.

   Das ist hier noch wichtiger als beim ersten Versand: Käme der
   Empfänger aus dem Browser, ließe sich über das Waschlurch-Postfach
   eine Nachricht an eine beliebige Adresse schicken, die für den
   Empfänger wie eine Antwort in einem laufenden Gespräch aussieht.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import { holen, aendern, anlegen, nurNeu, setzen, jetztIso } from '../lib/firestore.mjs';
import { pruefeAnmeldung, ratenGrenze, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { ROLLE_ADMIN, ROLLE_AKQUISE } from '../lib/rollen.mjs';
import { sendeUeberGmail, gmailAbsender, gmailEingerichtet, istEmail, adresseAus } from '../lib/gmail.mjs';

const HOECHSTENS_JE_STUNDE = 30;

/* Ein abgeschlossener Vorgang wird nicht wieder aufgemacht. */
const ABGESCHLOSSEN = ['kunde', 'kein_interesse', 'nicht_kontaktieren'];

export default async function handler(anfrage, antwortObj){
  if(anfrage.method !== 'POST'){
    antwortObj.setHeader('Allow', 'POST');
    return antworte(antwortObj, 405, { fehler:'Nur POST.' });
  }

  try {
    const koerper = await koerperLesen(anfrage);

    // ── 1. Wer ist es, und darf er das? ───────────────────────
    const wer = await pruefeAnmeldung(koerper.idToken);
    if(!wer.ok) return antworte(antwortObj, 401, { fehler: wer.grund });
    if(wer.rolle !== ROLLE_ADMIN && wer.rolle !== ROLLE_AKQUISE){
      return antworte(antwortObj, 403, { fehler:'Für den Versand fehlt die Berechtigung.' });
    }

    const grenze = await ratenGrenze('akqantwort:' + wer.uid, HOECHSTENS_JE_STUNDE, 60);
    if(!grenze.ok){
      return antworte(antwortObj, 429, {
        fehler:'Es wurden zu viele Antworten in kurzer Zeit versendet. Bitte später weitermachen.' });
    }

    const firmaId  = String(koerper.firma_id || '').trim();
    const antwortId = String(koerper.antwort_id || '').trim();
    const text = String(koerper.text || '').trim();
    if(!firmaId || !antwortId) return antworte(antwortObj, 400, { fehler:'Firma oder Antwort fehlt.' });

    // ── 7. Antworttext ────────────────────────────────────────
    if(!text) return antworte(antwortObj, 400, { fehler:'Die Antwort ist leer.' });
    if(text.length > 20000) return antworte(antwortObj, 400, { fehler:'Die Antwort ist zu lang.' });

    if(!gmailEingerichtet()){
      return antworte(antwortObj, 503, {
        fehler:'Das Akquise-Postfach ist noch nicht eingerichtet. Siehe EINRICHTUNG.md, Abschnitt Gmail.' });
    }

    // ── 2. Firma frisch laden ─────────────────────────────────
    const firma = await holen('firmen', firmaId);
    if(!firma) return antworte(antwortObj, 404, { fehler:'Diese Firma gibt es nicht (mehr).' });

    // ── 3. Antwort laden und Zugehörigkeit prüfen ─────────────
    const bezug = await holen('akquise_antworten', antwortId);
    if(!bezug) return antworte(antwortObj, 404, { fehler:'Diese Nachricht gibt es nicht (mehr).' });
    if(bezug.firma_id !== firmaId){
      return antworte(antwortObj, 400, { fehler:'Die Nachricht gehört nicht zu dieser Firma.' });
    }
    /* Auf eine selbst gesendete Nachricht wird nicht „geantwortet" –
       das wäre eine neue Nachricht an uns selbst. */
    if(bezug.richtung === 'ausgehend'){
      return antworte(antwortObj, 400, { fehler:'Auf eine eigene Nachricht kann nicht geantwortet werden.' });
    }

    // ── 4. Kontaktsperre ──────────────────────────────────────
    if(firma.do_not_contact === true){
      return antworte(antwortObj, 403, {
        fehler:'Dieser Kontakt ist gesperrt. Es darf keine Nachricht an ihn hinausgehen.' });
    }

    // ── 9. Abgeschlossener Vorgang ────────────────────────────
    if(ABGESCHLOSSEN.includes(firma.status)){
      return antworte(antwortObj, 409, {
        fehler:'Dieser Vorgang ist abgeschlossen. Es geht keine weitere Nachricht hinaus.' });
    }

    // ── 5. Gültiges Gespräch ──────────────────────────────────
    const threadId = bezug.gmail_thread_id || firma.gmail_thread_id || '';
    if(!threadId){
      return antworte(antwortObj, 400, {
        fehler:'Zu dieser Nachricht gibt es kein Gespräch – eine Antwort würde eine neue Unterhaltung beginnen.' });
    }

    /* ── 6./8. Empfänger ──────────────────────────────────────
       Er kommt AUSSCHLIESSLICH aus der eingegangenen Nachricht.
       Der Browser hat darauf keinen Einfluss; eine mitgeschickte
       Adresse wird nicht einmal gelesen.

       Geantwortet wird an den, der geschrieben hat – nicht an die
       hinterlegte Firmenadresse. Antwortet der Ansprechpartner von
       seiner persönlichen Adresse, ginge die Antwort sonst an die
       allgemeine Postadresse und käme nie bei ihm an. */
    const empfaenger = adresseAus(bezug.absender);
    if(!istEmail(empfaenger)){
      return antworte(antwortObj, 400, { fehler:'Zu dieser Nachricht gibt es keine brauchbare Absenderadresse.' });
    }
    if(empfaenger === adresseAus(gmailAbsender())){
      return antworte(antwortObj, 400, { fehler:'Der Empfänger wäre das eigene Postfach.' });
    }

    /* Betreff aus dem Gespräch, mit „Re: " davor. Ein frei
       wählbarer Betreff könnte das Gespräch beim Empfänger
       auseinanderreißen. */
    const roherBetreff = String(bezug.betreff || '').trim() || 'Ihre Nachricht';
    const betreff = /^re:/i.test(roherBetreff) ? roherBetreff : ('Re: ' + roherBetreff);

    /* ── 10. Doppelsendeschutz ────────────────────────────────
       Die Marke ergibt sich aus Bezugsnachricht UND Text. Ein
       Doppelklick schickt zweimal dasselbe – das wird abgefangen.
       Eine später bewusst geschriebene, andere Antwort hat einen
       anderen Text und kommt durch. */
    const marke = 'akqantw_' + crypto.createHash('sha256')
      .update(antwortId + '|' + text).digest('hex').slice(0, 40);

    const frisch = await nurNeu('mail_ereignisse', marke, {
      zweck: 'akquise_antwort',
      bezug_typ: 'akquise_antwort',
      bezug_id: antwortId,
      status: 'im_versand',
      zeitpunkt: jetztIso(),
    });
    if(!frisch){
      const alt = await holen('mail_ereignisse', marke);
      if(!alt || alt.status !== 'fehlgeschlagen'){
        return antworte(antwortObj, 409, {
          fehler:'Diese Antwort wurde bereits gesendet oder ist gerade unterwegs.', bereits_gesendet:true });
      }
      await setzen('mail_ereignisse', marke, { status:'im_versand', zeitpunkt: jetztIso() });
    }

    // ── Versand im bestehenden Gespräch ───────────────────────
    let ergebnis;
    try {
      ergebnis = await sendeUeberGmail({
        an: empfaenger, betreff, text,
        threadId,
        /* Ohne RFC-Kennung bleibt die Nachricht bei Gmail trotzdem im
           Gespräch; beim Empfänger kann sie als neue Mail erscheinen.
           Ältere Datensätze haben das Feld nicht – das ist kein Grund,
           den Versand zu verweigern. */
        inReplyTo: bezug.rfc_message_id || null,
        references: bezug.rfc_message_id || null,
      });
    } catch(err){
      try {
        await setzen('mail_ereignisse', marke, {
          status:'fehlgeschlagen', fehler: String(err.message).slice(0, 300),
          fehlgeschlagen_am: jetztIso(),
        });
      } catch(_){ /* der eigentliche Fehler ist wichtiger */ }
      console.error('Antwortversand fehlgeschlagen:', err.message);
      /* ⚠️ Es wird NICHTS gespeichert. Stünde die Antwort im
         Verlauf, obwohl sie nie hinausging, hielte Lukas die Sache
         für erledigt. */
      return antworte(antwortObj, 502, { fehler: err.message });
    }

    // ── Nach bestätigtem Erfolg festhalten ────────────────────
    const jetzt = jetztIso();
    const werName = wer.name || wer.email;

    /* Dieselbe Sammlung wie die eingehenden Nachrichten – daraus
       entsteht der Gesprächsverlauf. `gelesen: true`, weil eine
       selbst geschriebene Nachricht niemand lesen muss; sonst
       zählte sie als offene Antwort. */
    await setzen('akquise_antworten', ergebnis.messageId, {
      firma_id: firmaId,
      firma_name: firma.firmenname || '',
      nachricht_id: bezug.nachricht_id || null,
      antwort_auf: antwortId,
      gmail_message_id: ergebnis.messageId,
      gmail_thread_id: ergebnis.threadId || threadId,
      richtung: 'ausgehend',
      absender: ergebnis.absender,
      absender_name: 'Waschlurch',
      empfaenger,
      betreff,
      text,
      empfangen_am: jetzt,
      gesendet_am: jetzt,
      gesendet_von: werName,
      gesendet_von_uid: wer.uid,
      gelesen: true,
      importiert_am: jetzt,
    });

    try { await setzen('mail_ereignisse', marke, { status:'versendet', versendet_am: jetzt,
                                                   anbieter_kennung: ergebnis.messageId }); }
    catch(err){ console.error('Versandvermerk fehlgeschlagen:', err.message); }

    /* ⚠️ Der Status der Firma wird NICHT verändert. Ob aus einer
       Rückfrage Interesse wird, entscheidet der Mensch – nicht der
       Umstand, dass jemand zurückgeschrieben hat. */
    try {
      await aendern('firmen', firmaId, { letzter_kontakt: jetzt, aktualisiert_am: jetzt });
    } catch(err){ console.error('Letzter Kontakt nicht gesetzt:', err.message); }

    try {
      await anlegen('akquise_verlauf', {
        firma_id: firmaId,
        benutzer_uid: wer.uid,
        benutzer_name: werName,
        ereignis: 'antwort',
        beschreibung: 'Antwort an Kunden gesendet',
        createdAt: jetzt,
      });
    } catch(err){ console.error('Verlaufseintrag fehlgeschlagen:', err.message); }

    return antworte(antwortObj, 200, {
      ok:true, empfaenger, betreff,
      gmail_message_id: ergebnis.messageId,
      gmail_thread_id: ergebnis.threadId || threadId,
      gesendet_am: jetzt,
    });

  } catch(err){
    console.error('/api/akquise-antwort-senden:', err);
    return antworte(antwortObj, 500, { fehler:'Unerwarteter Fehler beim Versand.' });
  }
}
