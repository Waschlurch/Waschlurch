/* ══════════════════════════════════════════════════════════════
   /api/akquise-zu-kunde – aus einem Lead eine Kundenkarte machen
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 (Phase 7).

   ⚠️ Warum das serverseitig läuft, obwohl das Dashboard sonst direkt
   mit Firestore spricht:

   Die Sammlung `kunden` ist für die Akquise-Rolle nicht lesbar und
   soll es nicht werden – dort stehen alle Bestandskunden mit
   Anschriften, Notizen und Umsätzen. „Aus einem Lead eine
   Karteikarte machen" ist etwas anderes als „die Kundensammlung
   lesen".

   Dieser Endpunkt ist deshalb absichtlich eng: Er legt genau ein
   Dokument an und gibt nur dessen Kennung zurück. Lukas erfährt
   dadurch, dass die Übernahme geklappt hat – nicht, was sonst noch
   in der Kundenkartei steht.
   ══════════════════════════════════════════════════════════════ */

import { holen, nurNeu, setzen, jetztIso } from '../lib/firestore.mjs';
import { pruefeAnmeldung, ratenGrenze, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { ROLLE_ADMIN, ROLLE_AKQUISE } from '../lib/rollen.mjs';
import { uebernehmeAlsKunde } from '../lib/kunden.mjs';

const HOECHSTENS_JE_STUNDE = 30;

/* Nur diese Felder darf der Browser mitschicken. Alles andere wird
   nicht einmal gelesen – insbesondere nicht `status`, `kunden_id`
   oder `do_not_contact`. */
const ERLAUBTE_FELDER = ['firmenname','ansprechpartner','email','telefon',
                         'strasse','hausnummer','plz','ort','branche','standort','notizen'];

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
      return antworte(antwortObj, 403, { fehler:'Für die Übernahme fehlt die Berechtigung.' });
    }

    const grenze = await ratenGrenze('akqkunde:' + wer.uid, HOECHSTENS_JE_STUNDE, 60);
    if(!grenze.ok){
      return antworte(antwortObj, 429, { fehler:'Zu viele Übernahmen in kurzer Zeit. Bitte später weitermachen.' });
    }

    const firmaId = String(koerper.firma_id || '').trim();
    if(!firmaId) return antworte(antwortObj, 400, { fehler:'Keine Firma angegeben.' });

    // ── 2. Firma frisch laden ─────────────────────────────────
    const firma = await holen('firmen', firmaId);
    if(!firma) return antworte(antwortObj, 404, { fehler:'Diese Firma gibt es nicht (mehr).' });
    firma.id = firmaId;

    /* ── 5. Schon übernommen? ─────────────────────────────────
       Kein Fehler: Ein zweiter Klick nennt die vorhandene Kennung.
       Diese Prüfung steht VOR Status und Sperre – eine Firma, die
       inzwischen gesperrt wurde, bleibt trotzdem der Kunde, der sie
       geworden ist. */
    if(firma.kunden_id && firma.kunden_dokument_id){
      return antworte(antwortObj, 200, {
        ok:true, bereits:true, angelegt:false,
        kunden_id: firma.kunden_id,
        kunden_dokument_id: firma.kunden_dokument_id,
        kunde_seit: firma.kunde_seit || null,
        uebernommen_von: firma.uebernommen_von || null,
      });
    }

    // ── 4. Kontaktsperre ──────────────────────────────────────
    if(firma.do_not_contact === true){
      return antworte(antwortObj, 403, {
        fehler:'Dieser Kontakt ist gesperrt und kann nicht als Kunde übernommen werden.' });
    }

    // ── 3. Nur aus „Interesse" heraus ─────────────────────────
    if(firma.status !== 'interesse'){
      return antworte(antwortObj, 409, {
        fehler:'Nur eine Firma mit dem Stand „Interesse" kann als Kunde übernommen werden.' });
    }

    /* ── 6. Erforderliche Daten ───────────────────────────────
       Der Firmenname ist das Einzige, ohne das eine Karteikarte
       sinnlos wäre – so hält es auch das Kundenformular. */
    const ergaenzung = {};
    ERLAUBTE_FELDER.forEach(feld => {
      if(koerper[feld] !== undefined) ergaenzung[feld] = String(koerper[feld]).slice(0, 2000);
    });
    const nameFuerKarte = String(
      ergaenzung.firmenname !== undefined ? ergaenzung.firmenname : (firma.firmenname || '')).trim();
    if(!nameFuerKarte) return antworte(antwortObj, 400, { fehler:'Für die Kundenkarte fehlt der Firmenname.' });

    const mail = String(ergaenzung.email !== undefined ? ergaenzung.email : (firma.email || '')).trim();
    if(mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)){
      return antworte(antwortObj, 400, { fehler:'Diese E-Mail-Adresse sieht nicht richtig aus.' });
    }

    /* ── 8. Doppelklickschutz ─────────────────────────────────
       Zwei gleichzeitige Aufrufe sehen beide „noch kein Kunde".
       Die Marke lässt genau einen durch – dieselbe Bauweise wie
       beim Versand. */
    const marke = 'akqkunde_' + firmaId;
    const frisch = await nurNeu('akquise_uebernahmen', marke, {
      firma_id: firmaId, benutzer_uid: wer.uid, status:'laeuft', zeitpunkt: jetztIso(),
    });
    if(!frisch){
      const alt = await holen('akquise_uebernahmen', marke);
      if(alt && alt.status === 'fertig'){
        const nachzug = await holen('firmen', firmaId);
        return antworte(antwortObj, 200, {
          ok:true, bereits:true, angelegt:false,
          kunden_id: (nachzug && nachzug.kunden_id) || null,
          kunden_dokument_id: (nachzug && nachzug.kunden_dokument_id) || null,
        });
      }
      if(!alt || alt.status !== 'fehlgeschlagen'){
        return antworte(antwortObj, 409, { fehler:'Die Übernahme läuft bereits.' });
      }
      await setzen('akquise_uebernahmen', marke, { status:'laeuft', zeitpunkt: jetztIso() });
    }

    // ── 7. Übernahme ──────────────────────────────────────────
    let ergebnis;
    try {
      ergebnis = await uebernehmeAlsKunde({
        firma, ergaenzung, werUid: wer.uid, werName: wer.name || wer.email,
      });
    } catch(err){
      try { await setzen('akquise_uebernahmen', marke, {
        status:'fehlgeschlagen', fehler: String(err.message).slice(0, 300), zeitpunkt: jetztIso() }); }
      catch(_){ /* der eigentliche Fehler ist wichtiger */ }
      console.error('Kundenübernahme fehlgeschlagen:', err.message);
      return antworte(antwortObj, 500, { fehler:'Die Übernahme hat nicht geklappt: ' + err.message });
    }

    if(!ergebnis.ok){
      try { await setzen('akquise_uebernahmen', marke, { status:'fehlgeschlagen', zeitpunkt: jetztIso() }); }
      catch(_){ /* egal */ }
      return antworte(antwortObj, 400, { fehler: ergebnis.grund });
    }

    try { await setzen('akquise_uebernahmen', marke, {
      status:'fertig', kunden_id: ergebnis.kunden_id, zeitpunkt: jetztIso() }); }
    catch(err){ console.error('Übernahmevermerk fehlgeschlagen:', err.message); }

    return antworte(antwortObj, 200, {
      ok:true,
      bereits: !!ergebnis.bereits,
      angelegt: !!ergebnis.angelegt,
      kunden_id: ergebnis.kunden_id,
      kunden_dokument_id: ergebnis.kunden_dokument_id,
    });

  } catch(err){
    console.error('/api/akquise-zu-kunde:', err);
    return antworte(antwortObj, 500, { fehler:'Unerwarteter Fehler bei der Übernahme.' });
  }
}
