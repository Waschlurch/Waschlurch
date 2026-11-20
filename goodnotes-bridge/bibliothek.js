/* Die Bibliothek: ganze Goodnotes-Ordner im Browser.

   Die Dateien bleiben auf dem Gerät (IndexedDB). Claude sieht sie nur
   über die Werkzeuge in werkzeuge-client.js – und auch dann nur die
   Seiten, die es ausdrücklich anfordert. */

const DB_NAME = 'ink-bridge';
const SPEICHER = 'dateien';
export const SEITEN_PRO_AUFRUF = 10;
const BILD_KANTE = 1600;
const BILD_QUALITAET = 0.78;

/* ── IndexedDB ─────────────────────────────────────────── */
let dbP;
function db(){
  dbP ||= new Promise((ok, fehler) => {
    const a = indexedDB.open(DB_NAME, 1);
    a.onupgradeneeded = () => {
      const d = a.result;
      if(!d.objectStoreNames.contains(SPEICHER)){
        const s = d.createObjectStore(SPEICHER, { keyPath: 'pfad' });
        s.createIndex('ordner', 'ordner');
      }
    };
    a.onsuccess = () => ok(a.result);
    a.onerror = () => fehler(a.error);
  });
  return dbP;
}
async function tx(modus, arbeit){
  const d = await db();
  return new Promise((ok, fehler) => {
    const t = d.transaction(SPEICHER, modus);
    const anfrage = arbeit(t.objectStore(SPEICHER));
    t.oncomplete = () => ok(anfrage?.result);
    t.onerror = () => fehler(t.error);
    t.onabort = () => fehler(t.error || new Error('abgebrochen'));
  });
}

export const alleNotizen = () => tx('readonly', s => s.getAll());
export const eintragSpeichern = e => tx('readwrite', s => s.put(e));
export const notiz = pfad => tx('readonly', s => s.get(pfad));
export const loesche = pfad => tx('readwrite', s => s.delete(pfad));
export const leeren = () => tx('readwrite', s => s.clear());
export async function ordnerLoeschen(pfad){
  const alle = await alleNotizen();
  const raus = alle.filter(n => n.pfad === pfad || n.pfad.startsWith(pfad + '/'));
  await tx('readwrite', s => { for(const n of raus) s.delete(n.pfad); });
  for(const n of raus) geoeffnet.delete(n.pfad);
  return raus.length;
}

/** Ersetzt alle Einträge einer Quelle durch eine neue Liste.
    Bereits geladene Dateien bleiben erhalten, solange sie aktuell sind. */
export async function eintraegeErsetzen(quelle, liste){
  const alt = new Map((await alleNotizen()).filter(e => e.quelle === quelle).map(e => [e.pfad, e]));
  let neu = 0, behalten = 0;
  const kommen = new Set(liste.map(e => e.pfad));
  await tx('readwrite', s => {
    for(const [pfad] of alt) if(!kommen.has(pfad)) s.delete(pfad);
    for(const e of liste){
      const a = alt.get(e.pfad);
      if(a && a.geaendert === e.geaendert && a.blob){
        behalten++; s.put({ ...e, blob: a.blob, seiten: a.seiten || e.seiten, zwischenstand: a.zwischenstand });
      } else {
        if(!a) neu++;
        s.put({ ...e, seiten: a && a.geaendert === e.geaendert ? (a.seiten || 0) : 0 });
      }
    }
  });
  for(const e of liste) geoeffnet.delete(e.pfad);
  return { neu, behalten };
}

/* Wird von drive.js gesetzt: holt fehlende Dateien aus der Cloud. */
let lader = null;
export function setzeLader(f){ lader = f; }

/* ── pdf.js ────────────────────────────────────────────── */
let pdfP;
export function pdfjs(){
  pdfP ||= new Promise((ok, fehler) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      ok(window.pdfjsLib);
    };
    s.onerror = () => { pdfP = null; fehler(new Error('pdf.js ließ sich nicht laden.')); };
    document.head.append(s);
  });
  return pdfP;
}

/* Geöffnete PDFs bleiben kurz im Speicher, damit Seite 2 nicht erneut lädt. */
const geoeffnet = new Map();
async function pdfOeffnen(eintrag, blob){
  if(geoeffnet.has(eintrag.pfad)) return geoeffnet.get(eintrag.pfad);
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
  if(geoeffnet.size > 3){ const [alt, d] = geoeffnet.entries().next().value; geoeffnet.delete(alt); d.then?.(x => x.destroy?.()); }
  geoeffnet.set(eintrag.pfad, doc);
  return doc;
}

/* ── Aufnehmen ─────────────────────────────────────────── */
const BRAUCHBAR = /\.(pdf|png|jpe?g|webp|gif|heic|heif)$/i;
export const istBrauchbar = name => BRAUCHBAR.test(name);
const saeuberePfad = p => p.split('/').filter(t => t && t !== '.' && t !== '..' && !t.startsWith('.')).join('/');

/** Liest einen Drop-Vorgang aus – auch ganze Ordner samt Unterordnern. */
export async function ausDrop(dataTransfer){
  const eintraege = [...(dataTransfer.items || [])]
    .map(i => i.webkitGetAsEntry?.())
    .filter(Boolean);
  if(!eintraege.length){
    return [...(dataTransfer.files || [])].map(f => ({ datei: f, pfad: saeuberePfad(f.webkitRelativePath || f.name) }));
  }
  const raus = [];
  const lesen = (eintrag, basis) => new Promise(ok => {
    if(eintrag.isFile){
      eintrag.file(f => { raus.push({ datei: f, pfad: saeuberePfad(basis + f.name) }); ok(); }, ok);
    } else if(eintrag.isDirectory){
      const leser = eintrag.createReader();
      const runde = () => leser.readEntries(async liste => {
        if(!liste.length) return ok();
        for(const e of liste) await lesen(e, basis + eintrag.name + '/');
        runde();
      }, ok);
      runde();
    } else ok();
  });
  for(const e of eintraege) await lesen(e, '');
  return raus;
}

/** Nimmt eine Liste { datei, pfad } in die Bibliothek auf. */
export async function aufnehmen(liste, bericht = () => {}){
  const brauchbar = liste.filter(x => istBrauchbar(x.pfad));
  const neu = [];
  let i = 0;
  for(const { datei, pfad } of brauchbar){
    bericht(++i, brauchbar.length, pfad.split('/').pop());
    const istPdf = /\.pdf$/i.test(pfad);
    let seiten = 1;
    if(istPdf){
      try {
        const lib = await pdfjs();
        const doc = await lib.getDocument({ data: await datei.arrayBuffer() }).promise;
        seiten = doc.numPages; doc.destroy();
      } catch { seiten = 0; }   // 0 = Seitenzahl unbekannt
    }
    const teile = pfad.split('/');
    const eintrag = {
      pfad, name: teile.pop(), ordner: teile.join('/'),
      typ: istPdf ? 'application/pdf' : (datei.type || 'image/jpeg'),
      quelle: 'geraet', blob: datei, seiten, groesse: datei.size, zeit: Date.now(),
    };
    await tx('readwrite', s => s.put(eintrag));
    neu.push(eintrag);
  }
  return { neu, uebersprungen: liste.length - brauchbar.length };
}

/* ── Baum ──────────────────────────────────────────────── */
export function baum(eintraege){
  const wurzel = { name: '', pfad: '', ordner: new Map(), dateien: [], seiten: 0 };
  for(const e of eintraege){
    let k = wurzel;
    if(e.ordner) for(const teil of e.ordner.split('/')){
      if(!k.ordner.has(teil)) k.ordner.set(teil, { name: teil, pfad: k.pfad ? k.pfad + '/' + teil : teil, ordner: new Map(), dateien: [], seiten: 0 });
      k = k.ordner.get(teil);
    }
    k.dateien.push(e);
  }
  (function zaehle(k){
    k.seiten = k.dateien.reduce((s, d) => s + (d.seiten || 1), 0);
    for(const u of k.ordner.values()) k.seiten += zaehle(u);
    k.dateien.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    return k.seiten;
  })(wurzel);
  return wurzel;
}
export function ordnerFinden(wurzel, pfad){
  if(!pfad) return wurzel;
  let k = wurzel;
  for(const teil of pfad.split('/')){
    if(!k.ordner.has(teil)) return null;
    k = k.ordner.get(teil);
  }
  return k;
}

/* ── Seiten lesen ──────────────────────────────────────── */
/** Liefert Seiten als JPEG-base64 – genau das, was Claude bekommt. */
export async function seitenLesen(pfad, von = 1, bis = 0, melde = () => {}){
  const e = await notiz(pfad);
  if(!e) throw Object.assign(new Error(`Kein Notizbuch unter „${pfad}“.`), { sanft: true });

  let blob = e.blob;
  const veraltet = e.quelle === 'drive' && e.zwischenstand !== e.geaendert;
  if((!blob || veraltet) && lader) blob = await lader(e, t => melde(0, 0, t)) || blob;
  if(!blob) throw Object.assign(new Error(`„${pfad}“ ließ sich nicht öffnen.`), { sanft: true });

  if(e.typ !== 'application/pdf'){
    melde(1, 1);
    return { seiten: [{ nummer: 1, data: await bildAlsJpeg(blob) }], gesamt: 1, eintrag: e };
  }
  const doc = await pdfOeffnen(e, blob);
  const gesamt = doc.numPages;
  if(e.seiten !== gesamt) await eintragSpeichern({ ...e, blob, seiten: gesamt });
  const start = Math.max(1, Math.min(von || 1, gesamt));
  const ende = Math.min(gesamt, start + SEITEN_PRO_AUFRUF - 1, (bis && bis >= start) ? bis : Infinity);
  const seiten = [];
  for(let n = start; n <= ende; n++){
    melde(n - start + 1, ende - start + 1);
    const seite = await doc.getPage(n);
    const v1 = seite.getViewport({ scale: 1 });
    const vp = seite.getViewport({ scale: Math.min(2.4, BILD_KANTE / Math.max(v1.width, v1.height)) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await seite.render({ canvasContext: ctx, viewport: vp }).promise;
    seiten.push({ nummer: n, data: c.toDataURL('image/jpeg', BILD_QUALITAET).split(',')[1] });
    seite.cleanup?.();
  }
  return { seiten, gesamt, eintrag: e };
}

async function bildAlsJpeg(blob){
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, fehler) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehler(new Error('Bild unlesbar.')); i.src = url;
    });
    const f = Math.min(1, BILD_KANTE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', BILD_QUALITAET).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

/** Kleines Vorschaubild der ersten Seite (für die Liste). */
export async function vorschau(pfad, kante = 220){
  const { seiten } = await seitenLesen(pfad, 1, 1);
  const img = await new Promise((ok, fehler) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = 'data:image/jpeg;base64,' + seiten[0].data;
  });
  const f = Math.min(1, kante / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

export function groesseText(bytes){
  if(bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if(bytes > 1e6) return Math.round(bytes / 1e6) + ' MB';
  return Math.max(1, Math.round(bytes / 1e3)) + ' kB';
}
