/* ══════════════════════════════════════════════════════════════
   FIRESTORE ÜBER DIE REST-SCHNITTSTELLE
   ══════════════════════════════════════════════════════════════
   Bewusst ohne `firebase-admin` und ohne jede npm-Abhängigkeit.

   Grund: Sobald eine `package.json` im Repo liegt, startet Vercel
   einen Installations- und Bauschritt. Das Projekt hat bewusst
   keinen – Daniel lädt einzelne Dateien über die GitHub-Oberfläche
   hoch. Ein Bauschritt, den niemand lokal ausführen kann, wäre eine
   Fehlerquelle, die sich erst beim Deployment zeigt.

   Was hier steht, ist die vollständige Anbindung: ein signiertes
   JWT gegen Googles Token-Endpunkt, dann normale HTTPS-Aufrufe an
   firestore.googleapis.com. Etwa 200 Zeilen statt 4 MB Abhängigkeit.

   Dieser Ordner liegt bewusst NEBEN `api/`, nicht darin: Vercel
   macht aus jeder Datei in `api/` einen öffentlich erreichbaren
   Endpunkt. Hilfsdateien dürfen dort nicht liegen.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';

const PROJEKT = 'waschlurch-469d4';
const BASIS = `https://firestore.googleapis.com/v1/projects/${PROJEKT}/databases/(default)/documents`;

/* ── Zugangstoken ─────────────────────────────────────────────
   Wird für seine Laufzeit im Speicher gehalten. Serverless-Instanzen
   leben mehrere Aufrufe lang; ohne diesen Zwischenspeicher liefe je
   Mail ein zusätzlicher Handschlag mit Google. */
let tokenZwischenspeicher = { wert: null, laeuftAbUm: 0 };

function dienstkonto(){
  const roh = process.env.FIREBASE_DIENSTKONTO;
  if(!roh) throw new Error('FIREBASE_DIENSTKONTO ist nicht gesetzt. Siehe EINRICHTUNG.md, Schritt 3.');
  let konto;
  try { konto = JSON.parse(roh); }
  catch(_){
    throw new Error('FIREBASE_DIENSTKONTO ist kein gültiges JSON. Beim Kopieren muss der komplette Inhalt der Datei übernommen werden, von { bis }.');
  }
  if(!konto.client_email || !konto.private_key)
    throw new Error('FIREBASE_DIENSTKONTO fehlen client_email oder private_key.');
  return konto;
}

function base64url(puffer){
  return Buffer.from(puffer).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function zugangstoken(){
  if(tokenZwischenspeicher.wert && Date.now() < tokenZwischenspeicher.laeuftAbUm - 30000){
    return tokenZwischenspeicher.wert;
  }
  const konto = dienstkonto();
  const jetzt = Math.floor(Date.now() / 1000);

  const kopf = base64url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const inhalt = base64url(JSON.stringify({
    iss: konto.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: jetzt,
    exp: jetzt + 3600,
  }));

  /* Der private Schlüssel steht in der Umgebungsvariablen mit
     „\n" als Zeichenfolge, nicht als echter Zeilenumbruch – das
     macht Vercels Oberfläche so. Ohne diese Ersetzung meldet
     OpenSSL nur „unsupported". */
  const schluessel = String(konto.private_key).replace(/\\n/g, '\n');
  const signierer = crypto.createSign('RSA-SHA256');
  signierer.update(kopf + '.' + inhalt);
  const signatur = base64url(signierer.sign(schluessel));

  const antwort = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: kopf + '.' + inhalt + '.' + signatur,
    }),
  });
  const daten = await antwort.json();
  if(!antwort.ok) throw new Error('Google lehnte das Dienstkonto ab: ' + (daten.error_description || JSON.stringify(daten)));

  tokenZwischenspeicher = {
    wert: daten.access_token,
    laeuftAbUm: Date.now() + (Number(daten.expires_in) || 3600) * 1000,
  };
  return daten.access_token;
}

/* ── Werteumwandlung ──────────────────────────────────────────
   Firestore überträgt jeden Wert typisiert. Beide Richtungen
   müssen zusammenpassen, sonst kommen Zahlen als Zeichenketten
   zurück und eine Summe wird zur Verkettung.

   ⚠️ Ganze Zahlen gehen als `integerValue` hinaus, aber Firestore
   liefert sie als ZEICHENKETTE zurück – das ist kein Fehler,
   sondern JSON-Beschränkung bei 64-Bit-Zahlen. `ausWert` wandelt
   deshalb zurück. Ohne das ergäbe `betrag_cent + 100` bei einem
   gelesenen Wert die Zeichenkette „4500100". */
function zuWert(w){
  if(w === null || w === undefined) return { nullValue: null };
  if(typeof w === 'boolean') return { booleanValue: w };
  if(typeof w === 'number'){
    return Number.isInteger(w) ? { integerValue: String(w) } : { doubleValue: w };
  }
  if(typeof w === 'string') return { stringValue: w };
  if(w instanceof Date) return { timestampValue: w.toISOString() };
  if(Array.isArray(w)) return { arrayValue: { values: w.map(zuWert) } };
  if(typeof w === 'object'){
    const felder = {};
    for(const [k,v] of Object.entries(w)){
      if(v === undefined) continue;   // undefined weglassen, nicht als null schreiben
      felder[k] = zuWert(v);
    }
    return { mapValue: { fields: felder } };
  }
  return { stringValue: String(w) };
}

function ausWert(w){
  if(!w || typeof w !== 'object') return null;
  if('nullValue'      in w) return null;
  if('booleanValue'   in w) return w.booleanValue;
  if('integerValue'   in w) return Number(w.integerValue);
  if('doubleValue'    in w) return Number(w.doubleValue);
  if('stringValue'    in w) return w.stringValue;
  if('timestampValue' in w) return w.timestampValue;
  if('arrayValue'     in w) return (w.arrayValue.values || []).map(ausWert);
  if('mapValue'       in w){
    const o = {};
    for(const [k,v] of Object.entries(w.mapValue.fields || {})) o[k] = ausWert(v);
    return o;
  }
  return null;
}

function ausDokument(d){
  if(!d) return null;
  const o = {};
  for(const [k,v] of Object.entries(d.fields || {})) o[k] = ausWert(v);
  o.id = String(d.name || '').split('/').pop();
  return o;
}

async function aufruf(pfad, optionen = {}){
  const token = await zugangstoken();
  const antwort = await fetch(pfad.startsWith('http') ? pfad : BASIS + pfad, {
    ...optionen,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(optionen.headers || {}),
    },
  });
  const text = await antwort.text();
  let daten = null;
  if(text){ try { daten = JSON.parse(text); } catch(_){ daten = { rohtext: text }; } }
  if(!antwort.ok){
    const meldung = (daten && daten.error && daten.error.message) || ('HTTP ' + antwort.status);
    const fehler = new Error('Firestore: ' + meldung);
    fehler.status = antwort.status;
    throw fehler;
  }
  return daten;
}

/* ── Öffentliche Schnittstelle ────────────────────────────── */

export async function holen(sammlung, id){
  try {
    return ausDokument(await aufruf(`/${sammlung}/${encodeURIComponent(id)}`));
  } catch(err){
    if(err.status === 404) return null;
    throw err;
  }
}

export async function anlegen(sammlung, daten, id){
  const koerper = JSON.stringify({ fields: zuWert(daten).mapValue.fields });
  const pfad = id
    ? `/${sammlung}?documentId=${encodeURIComponent(id)}`
    : `/${sammlung}`;
  return ausDokument(await aufruf(pfad, { method:'POST', body: koerper }));
}

/* Nur die übergebenen Felder ändern. Ohne `updateMask` ersetzt
   Firestore das ganze Dokument – ein Status-Update löschte damit
   die komplette Kalkulation. */
export async function aendern(sammlung, id, daten){
  const felder = Object.keys(daten);
  const maske = felder.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  return ausDokument(await aufruf(
    `/${sammlung}/${encodeURIComponent(id)}?${maske}`,
    { method:'PATCH', body: JSON.stringify({ fields: zuWert(daten).mapValue.fields }) }
  ));
}

/* Anlegen oder ändern, je nachdem. Für Dokumente mit fester ID.
   ⚠️ Zwischen `holen` und `anlegen` passt ein zweiter Aufruf: Beide
   sehen „gibt es nicht", beide legen an, und der zweite bekommt von
   Firestore eine 409. Ohne den Rückfall unten landete dieser Fehler
   beim Kunden als 500 – ausgerechnet in der Ratenbegrenzung, die
   noch vor jeder eigentlichen Prüfung läuft. */
export async function setzen(sammlung, id, daten){
  const vorhanden = await holen(sammlung, id);
  if(vorhanden) return aendern(sammlung, id, daten);
  try {
    return await anlegen(sammlung, daten, id);
  } catch(err){
    if(err.status === 409) return aendern(sammlung, id, daten);
    throw err;
  }
}

/* Abfrage mit Filtern. `wo` ist eine Liste [feld, operator, wert].
   Operatoren: EQUAL, NOT_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL,
   GREATER_THAN, GREATER_THAN_OR_EQUAL, IN. */
export async function suchen(sammlung, wo = [], grenze = 200){
  const filter = wo.map(([feld, op, wert]) => ({
    fieldFilter: { field:{ fieldPath: feld }, op, value: zuWert(wert) },
  }));
  const abfrage = {
    structuredQuery: {
      from: [{ collectionId: sammlung }],
      limit: grenze,
      ...(filter.length
        ? { where: filter.length === 1
              ? filter[0]
              : { compositeFilter: { op:'AND', filters: filter } } }
        : {}),
    },
  };
  const ergebnis = await aufruf(':runQuery', { method:'POST', body: JSON.stringify(abfrage) });
  return (ergebnis || []).filter(z => z.document).map(z => ausDokument(z.document));
}

/* Alle Dokumente einer Sammlung – für kleine Sammlungen wie die
   Vorabkalkulationen völlig ausreichend und billiger als ein Index. */
export async function alle(sammlung, grenze = 300){
  const ergebnis = await aufruf(`/${sammlung}?pageSize=${grenze}`);
  return (ergebnis.documents || []).map(ausDokument);
}

/* Nur anlegen, wenn es das Dokument noch NICHT gibt. Grundlage der
   Idempotenz: Der Versandschutz und die Laufmarken der
   Automatismen hängen daran. Firestore lehnt ein zweites `create`
   auf dieselbe ID mit 409 ab – genau das wird hier ausgenutzt,
   statt vorher zu lesen und dann zu schreiben. Zwischen Lesen und
   Schreiben passt ein zweiter Aufruf. */
export async function nurNeu(sammlung, id, daten){
  try {
    await aufruf(
      `/${sammlung}?documentId=${encodeURIComponent(id)}`,
      { method:'POST', body: JSON.stringify({ fields: zuWert(daten).mapValue.fields }) }
    );
    return true;
  } catch(err){
    if(err.status === 409) return false;   // gab es schon
    throw err;
  }
}

/* Löschen. Wird nur für technische Marken gebraucht (Sperren,
   Ratenzähler) – Geschäftsdaten werden nie gelöscht, sondern
   archiviert oder storniert. */
export async function loeschen(sammlung, id){
  try {
    await aufruf(`/${sammlung}/${encodeURIComponent(id)}`, { method:'DELETE' });
    return true;
  } catch(err){
    if(err.status === 404) return false;
    throw err;
  }
}

export const jetztIso = () => new Date().toISOString();
