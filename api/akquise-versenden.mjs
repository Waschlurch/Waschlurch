/* ══════════════════════════════════════════════════════════════
   /api/akquise-versenden – Akquise-E-Mail über Gmail verschicken
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026.

   ⚠️ Der Browser schickt NUR zwei Kennungen: welche Firma und
   welcher Entwurf. Empfänger, Betreff und Text liest diese Funktion
   selbst aus der Datenbank.

   Käme der Empfänger aus dem Browser, ließe er sich im
   Entwicklerwerkzeug ändern – und über das Waschlurch-Postfach ginge
   eine beliebige Mail an eine beliebige Adresse hinaus. Dieselbe
   Überlegung wie bei `/api/versand`.

   Alle Prüfungen laufen hier noch einmal, obwohl das Dashboard sie
   schon gemacht hat. Das Dashboard ist die Vorwarnung; hier steht
   die Entscheidung. Zwischen beiden liegen Sekunden, in denen sich
   eine Sperre geändert haben kann.
   ══════════════════════════════════════════════════════════════ */

import { holen, aendern, anlegen, suchen, nurNeu, setzen, jetztIso } from '../lib/firestore.mjs';
import { pruefeAnmeldung, ratenGrenze, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { ROLLE_ADMIN, ROLLE_AKQUISE } from '../lib/rollen.mjs';
import { findeDubletten, grundlageGueltig } from '../lib/akquise.mjs';
import { sendeUeberGmail, gmailAbsender, gmailEingerichtet, istEmail } from '../lib/gmail.mjs';

/* Höchstens so viele Versendungen je Benutzer und Stunde.

   Der Wert ist bewusst niedrig: Akquise ist Handarbeit, jede Mail
   wird einzeln gelesen und ausgelöst. Zwanzig Stück in einer Stunde
   sind mehr, als ein Mensch sinnvoll vorbereiten kann – wer darüber
   liegt, tut etwas anderes als das, wofür der Knopf gedacht ist. */
const HOECHSTENS_JE_STUNDE = 20;

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

    /* Ratenbegrenzung je Benutzer, nicht je Adresse: Ein
       Massenversand wäre auch dann einer, wenn er von wechselnden
       Netzwerken käme. */
    const grenze = await ratenGrenze('akqversand:' + wer.uid, HOECHSTENS_JE_STUNDE, 60);
    if(!grenze.ok){
      return antworte(antwortObj, 429, {
        fehler:'Es wurden zu viele E-Mails in kurzer Zeit versendet. Bitte später weitermachen.' });
    }

    const firmaId = String(koerper.firma_id || '').trim();
    const nachrichtId = String(koerper.nachricht_id || '').trim();
    if(!firmaId || !nachrichtId) return antworte(antwortObj, 400, { fehler:'Firma oder Entwurf fehlt.' });

    if(!gmailEingerichtet()){
      return antworte(antwortObj, 503, {
        fehler:'Das Akquise-Postfach ist noch nicht eingerichtet. Siehe EINRICHTUNG.md, Abschnitt Gmail.' });
    }

    // ── 2./3. Firma und Entwurf frisch laden ──────────────────
    const firma = await holen('firmen', firmaId);
    if(!firma) return antworte(antwortObj, 404, { fehler:'Diese Firma gibt es nicht (mehr).' });

    const entwurf = await holen('akquise_nachrichten', nachrichtId);
    if(!entwurf) return antworte(antwortObj, 404, { fehler:'Diesen Entwurf gibt es nicht (mehr).' });
    if(entwurf.firma_id !== firmaId){
      return antworte(antwortObj, 400, { fehler:'Der Entwurf gehört nicht zu dieser Firma.' });
    }

    // ── 4. Nur ein freigegebener Entwurf geht hinaus ──────────
    if(entwurf.status === 'gesendet'){
      return antworte(antwortObj, 409, {
        fehler:'Diese Nachricht wurde bereits versendet.',
        bereits_gesendet:true,
        gmail_thread_id: entwurf.gmail_thread_id || null });
    }
    if(entwurf.status !== 'versandbereit'){
      return antworte(antwortObj, 400, {
        fehler:'Dieser Entwurf ist nicht als versandbereit markiert.' });
    }

    // ── 6. Kontaktsperre ──────────────────────────────────────
    if(firma.do_not_contact === true){
      return antworte(antwortObj, 403, {
        fehler:'Dieser Kontakt darf nicht vorbereitet oder versendet werden.' });
    }

    // ── 7. Kontaktgrundlage ───────────────────────────────────
    if(!grundlageGueltig(entwurf.kontaktgrundlage)){
      return antworte(antwortObj, 400, { fehler:'Die Kontaktgrundlage ist nicht geprüft.' });
    }

    // ── 8. Betreff und Text ───────────────────────────────────
    const betreff = String(entwurf.betreff || '').trim();
    const text    = String(entwurf.nachricht || '').trim();
    if(!betreff) return antworte(antwortObj, 400, { fehler:'Der Betreff fehlt.' });
    if(!text)    return antworte(antwortObj, 400, { fehler:'Die Nachricht fehlt.' });

    /* ── 5./10. Die AKTUELLE Adresse der Firma, nicht die im Entwurf.

       Zwischen dem Vorbereiten und dem Versenden können Tage liegen.
       Wurde die Adresse in der Zwischenzeit korrigiert, ginge die
       Mail sonst an die alte, falsche – und niemand merkte es. */
    const empfaenger = String(firma.email || '').trim();
    if(!istEmail(empfaenger)){
      return antworte(antwortObj, 400, {
        fehler:'Für diese Firma ist keine gültige E-Mail-Adresse hinterlegt.' });
    }

    /* ── 9. Sperrprüfung über ALLE gesperrten Firmen ───────────

       Der entscheidende Schritt. Geprüft wird der Kontakt, nicht der
       Datensatz: Ein zweiter Eintrag derselben Firma – andere
       Schreibweise der Nummer, neue Filialbezeichnung – wäre sonst
       der Weg um die Sperre herum.

       Abgefragt werden nur die gesperrten Einträge. Das ist billiger
       als der ganze Bestand und braucht keinen zusammengesetzten
       Index. */
    const gesperrte = await suchen('firmen', [['do_not_contact', 'EQUAL', true]], 300);
    const dub = findeDubletten({
      firmenname: firma.firmenname, standort: firma.standort, ort: firma.ort,
      email: empfaenger, telefon: firma.telefon, website: firma.website,
    }, gesperrte, firmaId);

    if(dub.gesperrt){
      /* Der Versuch gehört ins Protokoll – anhängen, nie ändern. */
      try {
        await anlegen('akquise_verlauf', {
          firma_id: firmaId,
          benutzer_uid: wer.uid,
          benutzer_name: wer.name || wer.email,
          ereignis: 'sperre',
          beschreibung: 'Versand durch Sperre verhindert (gesperrter Eintrag: ' +
                        ((dub.gesperrteFirma && dub.gesperrteFirma.firmenname) || 'unbekannt') + ')',
          createdAt: jetztIso(),
        });
      } catch(_){ /* Der Versand bleibt so oder so verweigert */ }

      return antworte(antwortObj, 403, {
        fehler:'Dieser Kontakt darf nicht vorbereitet oder versendet werden. ' +
               'Zu denselben Kontaktdaten gibt es einen gesperrten Eintrag.' });
    }

    /* ── Doppelsendeschutz ─────────────────────────────────────
       Der Statusvergleich oben fängt den zweiten Klick nur, wenn der
       erste schon fertig ist. Zwei gleichzeitige Aufrufe sehen beide
       „versandbereit" und würden beide senden.

       `nurNeu` legt eine Marke an und meldet, ob sie neu war –
       Firestore lässt ein zweites `create` auf dieselbe Kennung
       nicht zu. Genau einer kommt durch. Dieselbe Bauweise wie bei
       den Aktionstokens. */
    const marke = 'akq_' + nachrichtId;
    const frisch = await nurNeu('mail_ereignisse', marke, {
      zweck: 'akquise',
      bezug_typ: 'akquise_nachricht',
      bezug_id: nachrichtId,
      status: 'im_versand',
      zeitpunkt: jetztIso(),
    });
    if(!frisch){
      const alt = await holen('mail_ereignisse', marke);
      /* Ein gescheiterter Versuch darf wiederholt werden – sonst
         bliebe die Nachricht für immer hängen. Ein laufender oder
         erfolgreicher nicht. */
      if(!alt || alt.status !== 'fehlgeschlagen'){
        return antworte(antwortObj, 409, {
          fehler:'Diese Nachricht wird bereits versendet oder ist schon draußen.',
          bereits_gesendet:true });
      }
      await setzen('mail_ereignisse', marke, { status:'im_versand', zeitpunkt: jetztIso() });
    }

    // ── Versand ───────────────────────────────────────────────
    let ergebnis;
    try {
      ergebnis = await sendeUeberGmail({ an: empfaenger, betreff, text });
    } catch(err){
      /* ⚠️ Der Entwurf bleibt `versandbereit`. Nur die Marke wird auf
         „fehlgeschlagen" gesetzt, damit ein zweiter Versuch
         durchkommt. Nichts wird auf „gesendet" gedreht – sonst
         glaubte das Dashboard, die Mail sei draußen. */
      try {
        await setzen('mail_ereignisse', marke, {
          status:'fehlgeschlagen',
          fehler: String(err.message).slice(0, 300),
          fehlgeschlagen_am: jetztIso(),
        });
      } catch(_){ /* der eigentliche Fehler ist wichtiger */ }

      console.error('Akquise-Versand fehlgeschlagen:', err.message);
      return antworte(antwortObj, 502, { fehler: err.message });
    }

    // ── Nach bestätigtem Erfolg festhalten ────────────────────
    const jetzt = jetztIso();
    const werName = wer.name || wer.email;

    /* Reihenfolge mit Absicht: zuerst die Nachricht. An ihrer
       Thread-Kennung hängt die spätere Zuordnung der Antwort – geht
       danach etwas schief, ist wenigstens die Verbindung gesichert. */
    await aendern('akquise_nachrichten', nachrichtId, {
      status: 'gesendet',
      gmail_message_id: ergebnis.messageId,
      gmail_thread_id: ergebnis.threadId,
      empfaenger,
      absender: ergebnis.absender,
      betreff,
      gesendet_am: jetzt,
      gesendet_von: werName,
      gesendet_von_uid: wer.uid,
      aktualisiert_am: jetzt,
    });

    try { await setzen('mail_ereignisse', marke, { status:'versendet', versendet_am: jetzt,
                                                   anbieter_kennung: ergebnis.messageId }); }
    catch(err){ console.error('Versandvermerk fehlgeschlagen:', err.message); }

    /* Die Firma bekommt die Thread-Kennung ebenfalls. Phase 6B sucht
       damit in einem Zug die Firma zu einer eingehenden Antwort,
       ohne über die Nachrichten zu gehen. */
    try {
      await aendern('firmen', firmaId, {
        status: 'gesendet',
        letzter_kontakt: jetzt,
        gmail_thread_id: ergebnis.threadId,
        antwort_status: 'wartet',
        ungelesene_antworten: 0,
        letzte_antwort_am: null,
        aktualisiert_am: jetzt,
      });
    } catch(err){
      /* Die Mail ist draußen. Ein Fehler hier darf das nicht
         umdeuten – er wird gemeldet, nicht verschwiegen. */
      console.error('Firmenstatus konnte nicht gesetzt werden:', err.message);
    }

    try {
      await anlegen('akquise_verlauf', {
        firma_id: firmaId,
        benutzer_uid: wer.uid,
        benutzer_name: werName,
        ereignis: 'gesendet',
        beschreibung: 'E-Mail gesendet an ' + empfaenger,
        createdAt: jetzt,
      });
    } catch(err){ console.error('Verlaufseintrag fehlgeschlagen:', err.message); }

    return antworte(antwortObj, 200, {
      ok:true,
      empfaenger,
      absender: ergebnis.absender,
      gmail_message_id: ergebnis.messageId,
      gmail_thread_id: ergebnis.threadId,
      gesendet_am: jetzt,
    });

  } catch(err){
    console.error('/api/akquise-versenden:', err);
    return antworte(antwortObj, 500, { fehler:'Unerwarteter Fehler beim Versand.' });
  }
}
