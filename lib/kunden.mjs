/* ══════════════════════════════════════════════════════════════
   AKQUISE-LEAD ZU KUNDE MACHEN (SERVERSEITIG)
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 (Phase 7).

   ⚠️ Es entsteht KEINE zweite Kundenverwaltung. Geschrieben wird in
   die vorhandene Sammlung `kunden` – dieselbe, die das Dashboard
   unter „Kunden" zeigt und aus der Angebote und Rechnungen ihre
   Anschrift ziehen.

   Warum das hier serverseitig läuft und nicht im Browser:
   `kunden` ist für die Akquise-Rolle NICHT lesbar und soll es nicht
   werden – dort stehen alle Bestandskunden mit Anschriften, Notizen
   und Umsätzen. „Aus einem Lead eine Karteikarte machen" ist etwas
   anderes als „die Kundensammlung lesen". Deshalb dieser eng
   geschnittene Weg: Der Server legt genau ein Dokument an und gibt
   nur dessen Kennung zurück.
   ══════════════════════════════════════════════════════════════ */

import { holen, aendern, setzen, anlegen, nurNeu, jetztIso } from './firestore.mjs';

/* ⚠️ Muss zeichengenau dasselbe ergeben wie `emailToKey()` in
   admin.html – die Dokumentkennung eines Kunden hängt daran. Wichen
   beide voneinander ab, entstünde für dieselbe Adresse eine zweite
   Karteikarte. `tests/lauf.mjs` vergleicht beide Fassungen. */
export function emailZuSchluessel(email){
  return (email || 'unbekannt').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
}

/* Ohne E-Mail-Adresse hängt die Karteikarte an der Firma. Bewusst
   ableitbar und nicht zufällig: Ein zweiter Versuch nach einem
   Abbruch muss auf dasselbe Dokument zeigen, sonst entstünde beim
   Wiederholen ein zweiter Kunde. */
export function schluesselOhneMail(firmaId){
  return 'kunde_akq_' + String(firmaId).replace(/[^A-Za-z0-9_-]/g, '');
}

const NUMMER_PRAEFIX = 'WK-F-';
const ZAEHLER_DOK = 'kundennummernzaehler';

/* ══════════════════════════════════════════════════════════════
   FIRMENKUNDENNUMMER
   ══════════════════════════════════════════════════════════════
   `WK-F-000001`, fortlaufend und ohne Jahr: Die Nummer soll ein
   Kunde sein Leben lang behalten. Ein Jahresteil wäre eine Angabe,
   die nach zwölf Monaten nicht mehr stimmt.

   ⚠️ Die Eindeutigkeit hängt NICHT am Zähler, sondern am Verzeichnis
   `kundennummern`: Die Nummer ist dort die Dokumentkennung, und
   Firestore lässt kein zweites `create` darauf zu. Der Zähler sagt
   nur, wo mit dem Suchen begonnen wird.

   Damit ist die Vergabe auch dann sicher, wenn zwei Übernahmen
   gleichzeitig laufen oder der Zähler einmal veraltet ist – anders
   als bei „lesen, +1, schreiben", wo genau dazwischen der zweite
   Aufruf durchpasst. */
export async function naechsteKundennummer(){
  let start = 1;
  const zaehler = await holen('einstellungen', ZAEHLER_DOK);
  if(zaehler && Number(zaehler.naechste_nummer) > 0) start = Number(zaehler.naechste_nummer);

  for(let n = start; n < start + 500; n++){
    const nummer = NUMMER_PRAEFIX + String(n).padStart(6, '0');
    const frisch = await nurNeu('kundennummern', nummer, { vergeben_am: jetztIso() });
    if(frisch){
      /* Der Zähler ist eine Abkürzung fürs nächste Mal. Schlägt das
         Schreiben fehl, sucht der nächste Lauf einfach wieder von
         vorn – langsamer, aber richtig. */
      try { await setzen('einstellungen', ZAEHLER_DOK, { naechste_nummer: n + 1 }); }
      catch(err){ console.error('Kundennummernzähler nicht fortgeschrieben:', err.message); }
      return nummer;
    }
  }
  throw new Error('Es konnte keine freie Firmenkundennummer vergeben werden.');
}

/* ══════════════════════════════════════════════════════════════
   NUMMER FÜR EINEN BESTEHENDEN FIRMENKUNDEN (14.08.2026, Phase 8A)
   ══════════════════════════════════════════════════════════════
   Über die Akquise übernommene Leads bekommen ihre Nummer bei der
   Übernahme. Kunden, die vorher schon da waren, haben keine – und
   ohne Nummer nützt die modulübergreifende Verknüpfung ihnen nichts.

   ⚠️ Bewusst nur für `art: 'gewerblich'`. Privatkunden bleiben
   getrennt; eine „Firmenkundennummer" für Herrn Müller wäre eine
   Angabe, die nichts bedeutet.

   Die Funktion ist wiederholbar: Hat der Kunde schon eine Nummer,
   wird sie zurückgegeben und keine zweite vergeben. */
export async function nummerFuerKunde(kundenDokId){
  const kunde = await holen('kunden', kundenDokId);
  if(!kunde) return { ok:false, grund:'Diese Kundenkarte gibt es nicht (mehr).' };

  if(kunde.kunden_id){
    return { ok:true, bereits:true, kunden_id: kunde.kunden_id, kunden_dokument_id: kundenDokId };
  }

  if(kunde.art !== 'gewerblich'){
    return { ok:false, grund:'Eine Firmenkundennummer gibt es nur für gewerbliche Kunden.' };
  }

  const nummer = await naechsteKundennummer();
  await aendern('kunden', kundenDokId, { kunden_id: nummer, aktualisiert_am: jetztIso() });
  return { ok:true, bereits:false, kunden_id: nummer, kunden_dokument_id: kundenDokId };
}

/* Ein vorhandener Wert gewinnt gegen einen leeren – dasselbe
   Schutzprinzip wie `bevorzuge()` im Dashboard. Eine gepflegte
   Kundenanschrift darf nicht von einem leeren Akquisefeld
   überschrieben werden. */
function nurWennLeer(vorhanden, neu){
  const alt = String(vorhanden === undefined || vorhanden === null ? '' : vorhanden).trim();
  if(alt !== '') return null;
  const wert = String(neu === undefined || neu === null ? '' : neu).trim();
  return wert === '' ? null : wert;
}

/* Aus den Feldern einer Akquise-Firma die einer Kundenkarteikarte
   machen. Die Struktur von `kunden` gibt vor, was möglich ist:
   dort gibt es `strasse` als eine Zeile und keine `hausnummer`. */
export function kundendatenAus(firma, ergaenzung){
  const e = ergaenzung || {};
  const nimm = (feld) => {
    const wert = e[feld] !== undefined ? e[feld] : firma[feld];
    return String(wert === undefined || wert === null ? '' : wert).trim();
  };

  const strasse = [nimm('strasse'), nimm('hausnummer')].filter(Boolean).join(' ');
  const notizteile = [
    nimm('notizen') || nimm('notiz'),
    nimm('branche') ? 'Branche: ' + nimm('branche') : '',
    nimm('standort') ? 'Standort: ' + nimm('standort') : '',
    'Aus der Akquise übernommen.',
  ].filter(Boolean);

  return {
    firma: nimm('firmenname'),
    ansprechpartner: nimm('ansprechpartner'),
    email: nimm('email').toLowerCase(),
    telefon: nimm('telefon'),
    strasse,
    plz: nimm('plz'),
    ort: nimm('ort'),
    notizen: notizteile.join('\n'),
  };
}

/* ══════════════════════════════════════════════════════════════
   DIE ÜBERNAHME
   ══════════════════════════════════════════════════════════════
   Rückgabe:
     { ok, bereits?, kunden_id, kunden_dokument_id, angelegt }
   `bereits: true` heißt: Diese Firma war schon Kunde. Das ist kein
   Fehler – ein zweiter Klick soll die vorhandene Kennung nennen und
   keinen zweiten Kunden erzeugen. */
export async function uebernehmeAlsKunde({ firma, ergaenzung, werUid, werName }){
  /* Schon übernommen? Dann die vorhandene Kennung zurückgeben. */
  if(firma.kunden_id && firma.kunden_dokument_id){
    return {
      ok: true, bereits: true, angelegt: false,
      kunden_id: firma.kunden_id,
      kunden_dokument_id: firma.kunden_dokument_id,
    };
  }

  const daten = kundendatenAus(firma, ergaenzung);
  if(!daten.firma) return { ok:false, grund:'Für die Kundenkarte fehlt der Firmenname.' };

  const schluessel = daten.email
    ? emailZuSchluessel(daten.email)
    : schluesselOhneMail(firma.id);

  const vorhanden = await holen('kunden', schluessel);
  const jetzt = jetztIso();

  /* ⚠️ Gibt es zu dieser Adresse schon eine Karteikarte, wird KEINE
     zweite angelegt. Der Lead wird mit der vorhandenen verknüpft und
     nur ergänzt, was dort noch leer ist. Zwei Karteikarten für
     denselben Betrieb wären der Anfang von zwei Wahrheiten. */
  let kundenId = (vorhanden && vorhanden.kunden_id) || null;
  if(!kundenId) kundenId = await naechsteKundennummer();

  if(vorhanden){
    const ergaenzt = {};
    ['firma','ansprechpartner','email','telefon','strasse','plz','ort'].forEach(feld => {
      const wert = nurWennLeer(vorhanden[feld], daten[feld]);
      if(wert !== null) ergaenzt[feld] = wert;
    });
    ergaenzt.kunden_id = kundenId;
    ergaenzt.akquise_firma_id = firma.id;
    ergaenzt.herkunft = vorhanden.herkunft || 'akquise';
    ergaenzt.aktualisiert_am = jetzt;
    /* Die Notizen werden angehängt, nicht ersetzt – was dort steht,
       hat jemand von Hand geschrieben. */
    if(daten.notizen && !String(vorhanden.notizen || '').includes('Aus der Akquise übernommen')){
      ergaenzt.notizen = [String(vorhanden.notizen || '').trim(), daten.notizen].filter(Boolean).join('\n');
    }
    await aendern('kunden', schluessel, ergaenzt);
  } else {
    await setzen('kunden', schluessel, Object.assign({}, daten, {
      kunden_id: kundenId,
      art: 'gewerblich',          // ein Akquise-Lead ist immer ein Betrieb
      status: 'neukunde',
      manuell: true,              // von Hand gepflegt – gewinnt in deriveKundenList()
      ausgeblendet: false,
      herkunft: 'akquise',
      akquise_firma_id: firma.id,
      kunde_seit: jetzt,
      uebernommen_von: werName || '',
      createdAt: jetzt,
    }));
  }

  /* Die Verknüpfung in beide Richtungen. Daran hängen später
     Angebote, Rechnungen und Vorkalkulationen. */
  await aendern('firmen', firma.id, {
    status: 'kunde',
    kunden_id: kundenId,
    kunden_dokument_id: schluessel,
    kunde_seit: jetzt,
    uebernommen_von: werName || '',
    uebernommen_von_uid: werUid || '',
    aktualisiert_am: jetzt,
  });

  try {
    await anlegen('akquise_verlauf', {
      firma_id: firma.id,
      benutzer_uid: werUid || 'system',
      benutzer_name: werName || 'unbekannt',
      ereignis: 'kunde',
      beschreibung: 'Als Kunden übernommen (' + kundenId + ')',
      createdAt: jetzt,
    });
  } catch(err){ console.error('Verlaufseintrag zur Übernahme fehlgeschlagen:', err.message); }

  return {
    ok: true, bereits: false, angelegt: !vorhanden,
    kunden_id: kundenId, kunden_dokument_id: schluessel,
  };
}
