/* Google Drive als lebende Quelle der Bibliothek.

   Goodnotes sichert von selbst nach Google Drive. Diese Datei liest
   diesen Ordner aus: erst nur das Verzeichnis (Namen, Ordner, Zeiten),
   die eigentlichen PDFs erst dann, wenn Claude eine Seite lesen will.
   Einmal geladene Dateien bleiben im Gerätespeicher liegen, solange
   Goodnotes sie nicht geändert hat.

   Der Zugriff läuft ausschließlich im Browser: Das Anmeldefenster
   kommt von Google, der Schlüssel wandert nie über unseren Server. */

import { eintragSpeichern, eintraegeErsetzen, notiz, setzeLader } from './bibliothek.js';

const API = 'https://www.googleapis.com/drive/v3';
const BEREICH = 'https://www.googleapis.com/auth/drive.readonly';
const ORDNER_TYP = 'application/vnd.google-apps.folder';
const LESBAR = /\.(pdf|png|jpe?g|webp|gif)$/i;

const zustand = { token: null, gueltigBis: 0, clientId: null, client: null, wurzel: null };

/* ── Einstellungen ─────────────────────────────────────── */
export function clientIdLesen(){
  try { return localStorage.getItem('ib.gclient') || zustand.clientId || ''; } catch { return zustand.clientId || ''; }
}
export function clientIdSetzen(id){
  const s = String(id || '').trim();
  try { s ? localStorage.setItem('ib.gclient', s) : localStorage.removeItem('ib.gclient'); } catch {}
  zustand.client = null;
}
/** Vom Server hinterlegte Client-ID (Umgebungsvariable GOOGLE_CLIENT_ID). */
export async function clientIdVomServer(){
  try {
    const r = await fetch('api/konfig');
    if(!r.ok) return '';
    const { googleClientId } = await r.json();
    if(googleClientId) zustand.clientId = googleClientId;
    return googleClientId || '';
  } catch { return ''; }
}

export const wurzelLesen = () => { try { return JSON.parse(localStorage.getItem('ib.gwurzel') || 'null'); } catch { return null; } };
const wurzelSetzen = o => { try { o ? localStorage.setItem('ib.gwurzel', JSON.stringify(o)) : localStorage.removeItem('ib.gwurzel'); } catch {} zustand.wurzel = o; };
export const verbunden = () => !!(wurzelLesen() && clientIdLesen());

/* ── Anmeldung ─────────────────────────────────────────── */
let gisP;
function gis(){
  gisP ||= new Promise((ok, fehler) => {
    if(window.google?.accounts?.oauth2) return ok(window.google.accounts.oauth2);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => ok(window.google.accounts.oauth2);
    s.onerror = () => { gisP = null; fehler(new Error('Google-Anmeldung ließ sich nicht laden.')); };
    document.head.append(s);
  });
  return gisP;
}

/** Holt ein gültiges Zugriffsrecht. still = ohne Fenster, wenn möglich. */
export async function anmelden({ still = false } = {}){
  if(zustand.token && Date.now() < zustand.gueltigBis - 60_000) return zustand.token;
  const clientId = clientIdLesen();
  if(!clientId) throw Object.assign(new Error('Es fehlt die Google-Client-ID.'), { code: 'client_id' });

  const oauth2 = await gis();
  zustand.client ||= oauth2.initTokenClient({ client_id: clientId, scope: BEREICH, callback: () => {} });

  return new Promise((ok, fehler) => {
    zustand.client.callback = antwort => {
      if(antwort.error) return fehler(Object.assign(new Error(
        antwort.error === 'access_denied' ? 'Der Zugriff auf Google Drive wurde abgelehnt.'
          : 'Die Anmeldung bei Google ist fehlgeschlagen.'), { code: antwort.error }));
      zustand.token = antwort.access_token;
      zustand.gueltigBis = Date.now() + (Number(antwort.expires_in) || 3600) * 1000;
      ok(zustand.token);
    };
    try { zustand.client.requestAccessToken({ prompt: still ? '' : 'consent' }); }
    catch(e){ fehler(e); }
  });
}
export function abmelden(){
  const t = zustand.token;
  zustand.token = null; zustand.gueltigBis = 0;
  wurzelSetzen(null);
  if(t) window.google?.accounts?.oauth2?.revoke?.(t, () => {});
}

async function hole(pfad, { roh = false } = {}){
  const token = await anmelden({ still: true }).catch(() => anmelden());
  const r = await fetch(pfad.startsWith('http') ? pfad : API + pfad, { headers: { Authorization: 'Bearer ' + token } });
  if(r.status === 401){
    zustand.token = null;
    const neu = await anmelden();
    const r2 = await fetch(pfad.startsWith('http') ? pfad : API + pfad, { headers: { Authorization: 'Bearer ' + neu } });
    if(!r2.ok) throw await driveFehler(r2);
    return roh ? r2.blob() : r2.json();
  }
  if(!r.ok) throw await driveFehler(r);
  return roh ? r.blob() : r.json();
}
async function driveFehler(r){
  const text = await r.text().catch(() => '');
  let nachricht = `Google Drive antwortet mit Fehler ${r.status}.`;
  if(r.status === 403 && /rateLimit|userRateLimit/.test(text)) nachricht = 'Google Drive bremst gerade. In einer Minute erneut versuchen.';
  else if(r.status === 403) nachricht = 'Google Drive verweigert den Zugriff. Wurde die Freigabe erteilt?';
  else if(r.status === 404) nachricht = 'Die Datei liegt nicht mehr in Google Drive.';
  return Object.assign(new Error(nachricht), { status: r.status, sanft: true });
}

/* ── Verzeichnis durchgehen ────────────────────────────── */
const q = s => encodeURIComponent(s);

export async function kinder(ordnerId){
  const raus = [];
  let seite = '';
  do {
    const d = await hole(`/files?q=${q(`'${ordnerId}' in parents and trashed = false`)}`
      + `&fields=${q('nextPageToken,files(id,name,mimeType,size,modifiedTime)')}`
      + `&pageSize=200&orderBy=folder,name${seite ? '&pageToken=' + seite : ''}`);
    raus.push(...(d.files || []));
    seite = d.nextPageToken || '';
  } while(seite);
  return raus;
}

/** Ordner der obersten Ebene – zur Auswahl des Goodnotes-Ordners. */
export async function ordnerVorschlagen(){
  const d = await hole(`/files?q=${q(`mimeType = '${ORDNER_TYP}' and trashed = false`)}`
    + `&fields=${q('files(id,name,modifiedTime)')}&pageSize=100&orderBy=modifiedTime desc`);
  const alle = d.files || [];
  const passend = alle.filter(o => /good\s*notes|notiz|note/i.test(o.name));
  return [...passend, ...alle.filter(o => !passend.includes(o))].slice(0, 40);
}

/** Liest das ganze Verzeichnis unter der Wurzel ein (ohne Dateiinhalte). */
export async function einlesen(melde = () => {}){
  const wurzel = wurzelLesen();
  if(!wurzel) throw Object.assign(new Error('Es ist kein Google-Drive-Ordner ausgewählt.'), { sanft: true });

  const gefunden = [];
  const warteschlange = [{ id: wurzel.id, pfad: '' }];
  let ordnerZahl = 0;
  while(warteschlange.length){
    const { id, pfad } = warteschlange.shift();
    melde(`Liest Ordner ${++ordnerZahl}${pfad ? ' – ' + pfad : ''} …`);
    for(const k of await kinder(id)){
      const kindPfad = pfad ? pfad + '/' + k.name : k.name;
      if(k.mimeType === ORDNER_TYP){ warteschlange.push({ id: k.id, pfad: kindPfad }); continue; }
      if(!LESBAR.test(k.name)) continue;
      const teile = kindPfad.split('/');
      gefunden.push({
        pfad: kindPfad, name: teile.pop(), ordner: teile.join('/'),
        typ: /\.pdf$/i.test(k.name) ? 'application/pdf' : 'image/jpeg',
        quelle: 'drive', driveId: k.id, geaendert: k.modifiedTime,
        seiten: 0, groesse: Number(k.size) || 0, zeit: Date.now(),
      });
    }
  }
  const { behalten, neu } = await eintraegeErsetzen('drive', gefunden);
  return { gesamt: gefunden.length, neu, behalten, ordner: ordnerZahl, wurzel };
}

export async function wurzelWaehlen(ordner){
  wurzelSetzen({ id: ordner.id, name: ordner.name });
}

/* ── Dateien bei Bedarf holen ──────────────────────────── */
async function datei(eintrag, melde = () => {}){
  melde(`Holt „${eintrag.name}“ aus Google Drive …`);
  const blob = await hole(`/files/${eintrag.driveId}?alt=media`, { roh: true });
  await eintragSpeichern({ ...eintrag, blob, groesse: blob.size, zwischenstand: eintrag.geaendert });
  return blob;
}

/* Die Bibliothek fragt hier nach, wenn eine Drive-Datei noch fehlt
   oder in Goodnotes neuer ist als die zwischengespeicherte Fassung. */
setzeLader(async (eintrag, melde) => {
  if(eintrag.quelle !== 'drive') return null;
  const veraltet = eintrag.blob && eintrag.zwischenstand !== eintrag.geaendert;
  if(eintrag.blob && !veraltet) return eintrag.blob;
  return datei(eintrag, melde);
});

/** Entfernt zwischengespeicherte Dateien, behält das Verzeichnis. */
export async function zwischenspeicherLeeren(){
  const { alleNotizen, eintragSpeichern: speichern } = await import('./bibliothek.js');
  let n = 0;
  for(const e of await alleNotizen()){
    if(e.quelle === 'drive' && e.blob){ await speichern({ ...e, blob: undefined, zwischenstand: undefined }); n++; }
  }
  return n;
}

export { notiz };
