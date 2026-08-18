/* ══════════════════════════════════════════════════════════════
   AKQUISE – VEREINHEITLICHUNG UND SPERRPRÜFUNG (SERVERSEITIG)
   ══════════════════════════════════════════════════════════════
   Angelegt am 14.08.2026 für den Versand.

   ⚠️ Diese Datei ist die Zweitfassung derselben Regeln, die im
   Dashboard stehen (`akqNormEmail` und Nachbarn in `admin.html`).
   Ohne Bauschritt lässt sich keine Datei in den Browser importieren,
   und die Serverfunktion kann nicht in `admin.html` hineingreifen.

   Anders als bei den Bereichsrechten ist das hier NICHT nur Kosmetik:
   Was hier steht, entscheidet, ob eine Werbemail an einen gesperrten
   Kontakt hinausgeht. Deshalb gilt:

   → DIESE Fassung ist die verbindliche. Die im Browser ist die
     Vorwarnung, damit niemand erst beim Klicken erfährt, dass es
     nicht geht.
   → `tests/lauf.mjs` vergleicht beide Fassungen über eine Tabelle
     von Eingaben. Laufen sie auseinander, schlägt der Prüflauf fehl.

   Der Server ist die letzte Instanz: Er arbeitet mit dem Dienstkonto
   und umgeht die Firestore-Regeln planmäßig.
   ══════════════════════════════════════════════════════════════ */

export function normEmail(wert){
  return String(wert || '').replace(/\s+/g, '').toLowerCase();
}

/* ⚠️ Die eingeklammerte Null zuerst entfernen. „+49 (0) 2242 123456"
   ist eine der häufigsten Schreibweisen; ohne diesen Schritt bleibt
   die Null als Ziffer stehen und ergibt „002242123456" – dieselbe
   Nummer wäre dann zweimal vorhanden und die Sperre griffe nicht. */
export function normTelefon(wert){
  const roh = String(wert || '').replace(/\(\s*0\s*\)/g, '').replace(/[^\d+]/g, '');
  if(!roh) return '';
  const international = roh.startsWith('+') || roh.startsWith('00');
  let z = roh.replace(/\D/g, '');
  if(!international) return z;
  if(z.startsWith('00')) z = z.slice(2);
  if(z.startsWith('49')) return '0' + z.slice(2);
  return '+' + z;
}

export function normDomain(wert){
  let s = String(wert || '').trim().toLowerCase();
  if(!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^www\./, '');
  s = s.replace(/:\d+$/, '');
  s = s.replace(/\.$/, '');
  return s;
}

const RECHTSFORMEN = /\b(gmbh|mbh|ag|kg|kgaa|ohg|ug|gbr|se|ltd|inc|ek|ev|e\s+k|e\s+v|co|haftungsbeschraenkt|haftungsbeschränkt)\b/g;

export function normName(wert){
  return String(wert || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .replace(RECHTSFORMEN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normOrt(wert){
  return String(wert || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function orte(f){
  return [normOrt(f && f.ort), normOrt(f && f.standort)].filter(Boolean);
}

/* Gleichheit oder vollständige Enthaltung ab fünf Zeichen. Bewusst
   kein Ähnlichkeitsmaß – „Bäckerei Sonne" und „Bäckerei Sonner"
   wären damit dieselbe Firma. */
function namenPassen(a, b){
  if(!a || !b) return false;
  if(a === b) return true;
  if(a.length < 5 || b.length < 5) return false;
  return a.includes(b) || b.includes(a);
}

function ortePassen(a, b){
  if(!a.length || !b.length) return true;
  return a.some(x => b.includes(x));
}

/* Dieselbe Prüfung wie im Dashboard. Rückgabe:
     { stufe, treffer[], gesperrt, gesperrteFirma } */
export function findeDubletten(eingabe, bestand, ausserId){
  const e = {
    email:   normEmail(eingabe && eingabe.email),
    telefon: normTelefon(eingabe && eingabe.telefon),
    domain:  normDomain(eingabe && eingabe.website),
    name:    normName(eingabe && eingabe.firmenname),
    orte:    orte(eingabe || {}),
  };

  const treffer = [];
  (bestand || []).forEach(f => {
    if(!f) return;
    if(ausserId && f.id === ausserId) return;

    const gruende = [];
    const fEmail   = f.email_normalisiert   || normEmail(f.email);
    const fTelefon = f.telefon_normalisiert || normTelefon(f.telefon);
    const fDomain  = f.domain_normalisiert  || normDomain(f.website);

    if(e.email   && e.email   === fEmail)   gruende.push('E-Mail');
    if(e.telefon && e.telefon === fTelefon) gruende.push('Telefonnummer');
    if(e.domain  && e.domain  === fDomain)  gruende.push('Website');

    const hart = gruende.length > 0;
    if(e.name && namenPassen(e.name, normName(f.firmenname)) && ortePassen(e.orte, orte(f))){
      gruende.push('Firmenname und Ort');
    }
    if(!gruende.length) return;
    treffer.push({ firma:f, staerke: hart ? 'rot' : 'gelb', gruende });
  });

  treffer.sort((a, b) => (a.staerke === b.staerke) ? 0 : (a.staerke === 'rot' ? -1 : 1));
  const gesperrte = treffer.filter(t => t.firma.do_not_contact === true);

  return {
    stufe: treffer.length === 0 ? 'keine' : treffer[0].staerke,
    treffer,
    gesperrt: gesperrte.length > 0,
    gesperrteFirma: gesperrte.length ? gesperrte[0].firma : null,
  };
}

/* Kontaktgrundlagen. „ungeprueft" ist keine Grundlage – so heißt es
   auch im Dashboard. */
export const KONTAKTGRUNDLAGE_UNGEPRUEFT = 'ungeprueft';
export const KONTAKTGRUNDLAGEN_GUELTIG = ['einwilligung', 'bestandskontakt', 'angefordert', 'sonstige'];

export function grundlageGueltig(wert){
  return KONTAKTGRUNDLAGEN_GUELTIG.includes(String(wert || ''));
}
