/* Ink Bridge – Oberfläche. Kein Build-Schritt, läuft direkt im Browser. */

const MODI = [
  { id: 'transkribieren', titel: 'Transkribieren', kurz: 'Aa' },
  { id: 'zusammenfassen', titel: 'Zusammenfassen', kurz: '≡' },
  { id: 'aufgaben',       titel: 'Aufgaben',       kurz: '☐' },
  { id: 'lernkarten',     titel: 'Lernkarten',     kurz: '⧉' },
  { id: 'ausarbeiten',    titel: 'Ausarbeiten',    kurz: '¶' },
  { id: 'fragen',         titel: 'Frei fragen',    kurz: '?' },
  { id: 'schreiben',      titel: 'Neue Seite',     kurz: '+' },
];
const BUDGET_B64 = 4_150_000;        // Base64-Zeichen pro Anfrage (Serverlimit 4,4 MB)
const PDF_DIREKT_MAX = 2_900_000;    // kleinere PDFs gehen unverändert an Claude
const MAX_SEITEN = 20;

const $ = s => document.querySelector(s);
const zustand = {
  dateien: [],              // { id, name, type, data(base64), vorschau, groesse }
  modus: lies('ib.modus') || 'transkribieren',
  markdown: '',
  laeuft: null,             // AbortController
  pdf: { muster: lies('ib.muster') || 'liniert', thema: lies('ib.thema') || 'hell', format: lies('ib.format') || 'a4', rand: lies('ib.rand') !== '0' },
};

/* ── Speicher (fehlertolerant) ─────────────────────────── */
function lies(k){ try { return localStorage.getItem(k); } catch { return null; } }
function schreib(k, v){ try { localStorage.setItem(k, v); } catch {} }
function code(){ return lies('ib.code') || ''; }

/* ── Thema ─────────────────────────────────────────────── */
const gespeichertesThema = lies('ib.ui');
if(gespeichertesThema) document.documentElement.dataset.theme = gespeichertesThema;
$('#themaWechsel').addEventListener('click', () => {
  const dunkelJetzt = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const neu = dunkelJetzt ? 'light' : 'dark';
  document.documentElement.dataset.theme = neu; schreib('ib.ui', neu);
});

/* ── Modi ──────────────────────────────────────────────── */
const modiBox = $('#modi');
modiBox.setAttribute('role', 'radiogroup');
modiBox.setAttribute('aria-label', 'Modus');
for(const m of MODI){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = m.id; b.setAttribute('role', 'radio');
  b.innerHTML = `<i aria-hidden="true">${m.kurz}</i>${m.titel}`;
  b.addEventListener('click', () => setzeModus(m.id));
  modiBox.append(b);
}
modiBox.addEventListener('keydown', e => {
  if(!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const i = MODI.findIndex(m => m.id === zustand.modus);
  const n = MODI[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : MODI.length - 1)) % MODI.length];
  setzeModus(n.id); modiBox.querySelector(`[data-id="${n.id}"]`).focus();
});
function setzeModus(id){
  if(!MODI.some(m => m.id === id)) id = 'transkribieren';
  zustand.modus = id; schreib('ib.modus', id);
  for(const b of modiBox.children){
    const an = b.dataset.id === id;
    b.setAttribute('aria-checked', an); b.tabIndex = an ? 0 : -1;
  }
  const label = $('#wunschLabel');
  if(id === 'fragen') label.innerHTML = 'Deine Frage an die Notizen';
  else if(id === 'schreiben') label.innerHTML = 'Was soll auf die neue Seite?';
  else label.innerHTML = 'Zusatzwunsch <span class="leise">(optional)</span>';
  $('#wunsch').placeholder = id === 'schreiben'
    ? 'z. B. „Lernblatt Photosynthese für die 9. Klasse mit Übungen“'
    : id === 'fragen' ? 'z. B. „Welche Formeln brauche ich für Aufgabe 3?“'
    : 'z. B. „Nur Kapitel 2“, „auf Englisch“, „für die Klausur am Montag“';
}
setzeModus(zustand.modus);

/* ── Dateien aufnehmen ─────────────────────────────────── */
const ablage = $('#ablage'), wahl = $('#dateiwahl');
ablage.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); wahl.click(); } });
wahl.addEventListener('change', () => { nimmAuf([...wahl.files]); wahl.value = ''; });
['dragenter', 'dragover'].forEach(t => ablage.addEventListener(t, e => { e.preventDefault(); ablage.classList.add('drueber'); }));
['dragleave', 'drop'].forEach(t => ablage.addEventListener(t, e => { e.preventDefault(); ablage.classList.remove('drueber'); }));
ablage.addEventListener('drop', e => nimmAuf([...(e.dataTransfer?.files || [])]));
document.addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])];
  if(f.length){ e.preventDefault(); nimmAuf(f); }
});

async function nimmAuf(liste){
  const brauchbar = liste.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|heic|heif|png|jpe?g|webp)$/i.test(f.name));
  if(brauchbar.length < liste.length) toast('Nur PDFs und Bilder werden übernommen.');
  for(const f of brauchbar){
    try {
      status(`Bereite „${f.name}“ vor …`, true);
      const neu = await vorbereiten(f);
      zustand.dateien.push(...neu);
      if(zustand.dateien.length > MAX_SEITEN){
        zustand.dateien.length = MAX_SEITEN;
        toast(`Höchstens ${MAX_SEITEN} Seiten pro Durchgang.`);
      }
      zeigeDateien();
    } catch(e){
      console.error(e);
      toast(`„${f.name}“ ließ sich nicht lesen.`);
    }
  }
  status('');
  if(zustand.modus === 'schreiben' && zustand.dateien.length) setzeModus('transkribieren');
  if((!$('#pdfTitel').value || $('#pdfTitel').dataset.auto) && brauchbar[0]){
    $('#pdfTitel').value = brauchbar[0].name.replace(/\.[^.]+$/, ''); $('#pdfTitel').dataset.auto = '1';
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

async function vorbereiten(datei){
  const istPdf = datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name);
  if(istPdf && datei.size <= PDF_DIREKT_MAX){
    return [{ id: uid(), name: datei.name, type: 'application/pdf', data: await alsBase64(datei), vorschau: null, groesse: datei.size }];
  }
  if(istPdf) return pdfZuBildern(datei);
  const bild = await bildLaden(datei);
  const { data, vorschau } = await bildKodieren(bild, 2000, .86);
  return [{ id: uid(), name: datei.name, type: 'image/jpeg', data, vorschau, groesse: data.length }];
}

function alsBase64(blob){
  return new Promise((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = fehler;
    r.readAsDataURL(blob);
  });
}
function bildLaden(blob){
  return new Promise((ok, fehler) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); fehler(new Error('bild')); };
    img.src = url;
  });
}
async function bildKodieren(quelle, maxKante, qualitaet){
  const w = quelle.naturalWidth || quelle.width, h = quelle.naturalHeight || quelle.height;
  const f = Math.min(1, maxKante / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * f); c.height = Math.round(h * f);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // transparente Goodnotes-Exporte
  ctx.drawImage(quelle, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', qualitaet);
  const kc = document.createElement('canvas');
  const kf = 240 / Math.max(c.width, c.height);
  kc.width = Math.round(c.width * kf); kc.height = Math.round(c.height * kf);
  kc.getContext('2d').drawImage(c, 0, 0, kc.width, kc.height);
  return { data: url.split(',')[1], vorschau: kc.toDataURL('image/jpeg', .7), canvas: c };
}

let pdfjsLaden;
function pdfjs(){
  pdfjsLaden ||= new Promise((ok, fehler) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      ok(window.pdfjsLib);
    };
    s.onerror = () => { pdfjsLaden = null; fehler(new Error('pdfjs')); };
    document.head.append(s);
  });
  return pdfjsLaden;
}
async function pdfZuBildern(datei){
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: await datei.arrayBuffer() }).promise;
  const anzahl = Math.min(doc.numPages, MAX_SEITEN);
  if(doc.numPages > MAX_SEITEN) toast(`Großes Notizbuch: die ersten ${MAX_SEITEN} Seiten werden übernommen.`);
  const raus = [];
  for(let i = 1; i <= anzahl; i++){
    status(`Lese Seite ${i} von ${anzahl} …`, true);
    const seite = await doc.getPage(i);
    const v1 = seite.getViewport({ scale: 1 });
    const vp = seite.getViewport({ scale: Math.min(2.5, 1700 / Math.max(v1.width, v1.height)) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await seite.render({ canvasContext: ctx, viewport: vp }).promise;
    const { data, vorschau } = await bildKodieren(c, 1700, .82);
    raus.push({ id: uid(), name: `${datei.name} · S. ${i}`, type: 'image/jpeg', data, vorschau, groesse: data.length });
  }
  return raus;
}

/** Hält die Anfrage unter der Servergrenze, indem Bilder nachverdichtet werden. */
async function passendMachen(){
  let summe = () => zustand.dateien.reduce((s, d) => s + d.data.length, 0);
  let runde = 0;
  while(summe() > BUDGET_B64 && runde < 4){
    runde++;
    const bilder = zustand.dateien.filter(d => d.type === 'image/jpeg');
    if(!bilder.length) break;
    status('Verdichte Seiten für die Übertragung …', true);
    for(const d of bilder){
      const img = await bildLaden(await (await fetch('data:image/jpeg;base64,' + d.data)).blob());
      const kante = Math.max(img.naturalWidth, img.naturalHeight) * 0.8;
      d.data = (await bildKodieren(img, Math.max(900, kante), Math.max(.55, .8 - runde * .07))).data;
    }
  }
  return summe() <= BUDGET_B64;
}

function zeigeDateien(){
  const ul = $('#dateien'); ul.replaceChildren();
  for(const d of zustand.dateien){
    const li = document.createElement('li'); li.className = 'datei';
    li.innerHTML = d.vorschau ? `<img alt="" src="${d.vorschau}">` : `<div class="pdf">PDF</div>`;
    const name = document.createElement('span'); name.className = 'name'; name.textContent = d.name;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕';
    x.setAttribute('aria-label', `${d.name} entfernen`);
    x.addEventListener('click', () => { zustand.dateien = zustand.dateien.filter(e => e.id !== d.id); zeigeDateien(); });
    li.append(name, x); ul.append(li);
  }
}

/* ── Senden & Streamen ─────────────────────────────────── */
const los = $('#los'), ausgabe = $('#ausgabe'), blatt = $('#blatt');

los.addEventListener('click', () => zustand.laeuft ? abbrechen() : senden());
document.addEventListener('keydown', e => {
  if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); if(!zustand.laeuft) senden(); }
  if(e.key === 'Escape' && zustand.laeuft) abbrechen();
});

function abbrechen(){ zustand.laeuft?.abort(); }

async function senden(){
  const frage = $('#wunsch').value.trim();
  if(zustand.modus !== 'schreiben' && !zustand.dateien.length){ ablage.focus(); return status('Erst Goodnotes-Seiten ablegen – oder „Neue Seite“ wählen.', false, true); }
  if((zustand.modus === 'schreiben' || zustand.modus === 'fragen') && !frage){ $('#wunsch').focus(); return status(zustand.modus === 'fragen' ? 'Bitte eine Frage eingeben.' : 'Beschreibe kurz, was auf die Seite soll.', false, true); }
  if(!(await passendMachen())) return status('Zu viele oder zu große Seiten. Bitte in kleineren Portionen senden.', false, true);

  const ctrl = new AbortController(); zustand.laeuft = ctrl;
  zustand.markdown = ''; bearbeiten(false);
  $('#leer').hidden = true; ausgabe.hidden = false; ausgabe.replaceChildren(); ausgabe.classList.add('schreibt');
  document.body.classList.add('fliesst'); los.classList.add('arbeitet');
  los.querySelector('.los-text').textContent = 'Claude liest – Esc bricht ab';
  status('Claude liest deine Seiten', true);
  aktionenAn(false);
  if(matchMedia('(max-width: 980px)').matches) blatt.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let fehler = null, fertig = null;
  try {
    const r = await api('api/claude', { modus: zustand.modus, frage, dateien: zustand.dateien.map(({ name, type, data }) => ({ name, type, data })) }, ctrl.signal);
    if(r.status === 401) fehler = 'Ohne gültigen Zugangscode geht es nicht weiter.';
    else if(!r.ok){ fehler = (await r.json().catch(() => ({}))).message || `Fehler ${r.status}`; }
    else {
      const leser = r.body.getReader(); const dec = new TextDecoder(); let puffer = '';
      let erstes = true;
      for(;;){
        const { value, done } = await leser.read();
        if(done) break;
        puffer += dec.decode(value, { stream: true });
        let nl;
        while((nl = puffer.indexOf('\n')) >= 0){
          const zeile = puffer.slice(0, nl); puffer = puffer.slice(nl + 1);
          if(!zeile.trim()) continue;
          const ev = JSON.parse(zeile);
          if(ev.t === 'text'){
            if(erstes){ status('Claude schreibt', true); erstes = false; }
            zustand.markdown += ev.d; malen();
          } else if(ev.t === 'done') fertig = ev;
          else if(ev.t === 'error') fehler = ev.message;
        }
      }
    }
  } catch(e){
    fehler = e.name === 'AbortError' ? 'Abgebrochen.' : 'Keine Verbindung zur Brücke.';
  }

  zustand.laeuft = null;
  ausgabe.classList.remove('schreibt'); document.body.classList.remove('fliesst'); los.classList.remove('arbeitet');
  los.querySelector('.los-text').textContent = 'Über die Brücke schicken';
  malen(true);

  if(fehler) status(fehler, false, true);
  else if(fertig?.stop === 'max_tokens') status('Fertig – die Antwort war sehr lang und wurde gekürzt.');
  else status('');
  if(zustand.markdown.trim()){
    aktionenAn(true);
    if(!$('#pdfTitel').value || $('#pdfTitel').dataset.auto){
      const h = zustand.markdown.match(/^#\s+(.+)$/m);
      if(h){ $('#pdfTitel').value = h[1].replace(/[*_`]/g, '').slice(0, 120); $('#pdfTitel').dataset.auto = '1'; }
    }
    if(!fehler) merken();
  } else if(!fehler) status('Claude hat nichts zurückgegeben.', false, true);
}

let malTimer = 0;
function malen(sofort){
  if(!sofort){ if(malTimer) return; malTimer = requestAnimationFrame(() => { malTimer = 0; malen(true); }); return; }
  const unten = blatt.scrollHeight - blatt.scrollTop - blatt.clientHeight < 80;
  ausgabe.innerHTML = rendern(zustand.markdown);
  if(unten && zustand.laeuft) blatt.scrollTop = blatt.scrollHeight;
}
function rendern(md){
  if(window.marked && window.DOMPurify){
    return DOMPurify.sanitize(marked.parse(md, { gfm: true, breaks: false }));
  }
  const p = document.createElement('pre'); p.textContent = md; return p.outerHTML;
}

/* ── Bearbeiten / Kopieren ─────────────────────────────── */
const editor = $('#editor');
$('#bearbeiten').addEventListener('click', () => bearbeiten(editor.hidden));
function bearbeiten(an){
  if(!an && !editor.hidden){ zustand.markdown = editor.value; malen(true); merken(true); }
  editor.hidden = !an; ausgabe.hidden = an || !zustand.markdown;
  $('#bearbeiten').setAttribute('aria-pressed', an); $('#bearbeiten').textContent = an ? 'Fertig' : 'Bearbeiten';
  if(an){ editor.value = zustand.markdown; editor.style.height = Math.max(440, blatt.clientHeight - 60) + 'px'; editor.focus(); }
}
$('#kopieren').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(aktuellerText()); toast('Markdown kopiert – in Goodnotes als Text einfügen.'); }
  catch { toast('Kopieren nicht erlaubt.'); }
});
const aktuellerText = () => editor.hidden ? zustand.markdown : editor.value;

function aktionenAn(an){
  for(const id of ['#bearbeiten', '#kopieren', '#teilen', '#laden']) $(id).disabled = !an;
}

/* ── PDF zurück nach Goodnotes ─────────────────────────── */
function segment(box, schluessel){
  const el = $(box);
  const setze = v => { zustand.pdf[schluessel] = v; schreib('ib.' + schluessel, v);
    for(const b of el.children) b.setAttribute('aria-checked', b.dataset.v === v); };
  el.addEventListener('click', e => { const b = e.target.closest('button'); if(b) setze(b.dataset.v); });
  setze(zustand.pdf[schluessel]);
}
segment('#optMuster', 'muster');
segment('#optThema', 'thema');
$('#optFormat').value = zustand.pdf.format;
$('#optFormat').addEventListener('change', e => { zustand.pdf.format = e.target.value; schreib('ib.format', e.target.value); });
$('#optRand').checked = zustand.pdf.rand;
$('#optRand').addEventListener('change', e => { zustand.pdf.rand = e.target.checked; schreib('ib.rand', e.target.checked ? '1' : '0'); });
$('#pdfTitel').addEventListener('input', e => delete e.target.dataset.auto);

async function pdfHolen(){
  const titel = $('#pdfTitel').value.trim() || 'Goodnotes-Seite';
  const r = await api('api/pdf', { markdown: aktuellerText(), titel, ...zustand.pdf });
  if(r.status === 401) throw new Error('Ohne gültigen Zugangscode geht es nicht weiter.');
  if(!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'PDF fehlgeschlagen.');
  const name = dateiname(titel);
  return new File([await r.blob()], name, { type: 'application/pdf' });
}

$('#teilen').addEventListener('click', async e => {
  const knopf = e.currentTarget; knopf.disabled = true;
  try {
    const datei = await pdfHolen();
    if(navigator.canShare?.({ files: [datei] })){
      try { await navigator.share({ files: [datei], title: datei.name }); toast('Im Teilen-Menü „Goodnotes“ wählen.'); }
      catch(err){ if(err.name !== 'AbortError') herunterladen(datei); }
    } else {
      herunterladen(datei);
      toast('PDF geladen – in Goodnotes über „Importieren“ öffnen.');
    }
  } catch(err){ status(err.message, false, true); }
  knopf.disabled = false;
});
$('#laden').addEventListener('click', async e => {
  const knopf = e.currentTarget; knopf.disabled = true;
  try { herunterladen(await pdfHolen()); } catch(err){ status(err.message, false, true); }
  knopf.disabled = false;
});
function dateiname(titel){
  const s = titel.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 80);
  return (s || 'Goodnotes-Seite') + '.pdf';
}
function herunterladen(datei){
  const url = URL.createObjectURL(datei);
  const a = Object.assign(document.createElement('a'), { href: url, download: datei.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ── Verlauf ───────────────────────────────────────────── */
function verlaufLesen(){ try { return JSON.parse(lies('ib.verlauf') || '[]'); } catch { return []; } }
let letzterEintrag = null;
function merken(aktualisieren){
  const liste = verlaufLesen();
  const titel = ($('#pdfTitel').value || zustand.markdown.match(/^#\s+(.+)$/m)?.[1] || 'Ohne Titel').slice(0, 90);
  if(aktualisieren && letzterEintrag){
    const e = liste.find(x => x.id === letzterEintrag);
    if(e){ e.md = zustand.markdown; e.titel = titel; }
  } else {
    letzterEintrag = uid();
    liste.unshift({ id: letzterEintrag, titel, modus: zustand.modus, zeit: Date.now(), md: zustand.markdown });
  }
  schreib('ib.verlauf', JSON.stringify(liste.slice(0, 25)));
}
$('#verlaufAuf').addEventListener('click', () => {
  const ol = $('#verlaufListe'); ol.replaceChildren();
  for(const e of verlaufLesen()){
    const li = document.createElement('li'); const b = document.createElement('button');
    const t = document.createElement('strong'); t.textContent = e.titel;
    const s = document.createElement('small');
    s.textContent = `${MODI.find(m => m.id === e.modus)?.titel || ''} · ${new Date(e.zeit).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`;
    b.append(t, s);
    b.addEventListener('click', () => {
      zustand.markdown = e.md; letzterEintrag = e.id; bearbeiten(false);
      $('#leer').hidden = true; ausgabe.hidden = false; malen(true); aktionenAn(true);
      $('#pdfTitel').value = e.titel; $('#verlauf').close();
    });
    li.append(b); ol.append(li);
  }
  $('#verlauf').showModal();
});
$('#verlaufLeeren').addEventListener('click', () => { schreib('ib.verlauf', '[]'); $('#verlaufListe').replaceChildren(); });
$('#hilfeAuf').addEventListener('click', () => $('#hilfe').showModal());
document.querySelectorAll('[data-zu]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if(e.target === d && d.id !== 'zugang') d.close(); }));

/* ── Zugang ────────────────────────────────────────────── */
/** POST mit Zugangscode; bei 401 einmal nach dem Code fragen und wiederholen. */
async function api(pfad, koerper, signal){
  const body = JSON.stringify(koerper);
  for(let versuch = 0; ; versuch++){
    const r = await fetch(pfad, { method: 'POST', signal, body,
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Code': code() } });
    if(r.status !== 401 || versuch >= 2) return r;
    const hatteCode = !!code();
    schreib('ib.code', '');
    if(!(await zugangErfragen(hatteCode))) return r;
  }
}

function zugangErfragen(falsch){
  const d = $('#zugang');
  $('#zugangFehler').hidden = !falsch; $('#zugangFehler').textContent = falsch ? 'Der Code stimmt nicht. Bitte erneut eingeben.' : '';
  $('#zugangCode').value = '';
  if(!d.open) d.showModal();
  return new Promise(ok => d.addEventListener('close', () => {
    const v = $('#zugangCode').value.trim();
    if(d.returnValue === 'ok' && v){ schreib('ib.code', v); ok(true); } else ok(false);
  }, { once: true }));
}

/* ── Status & Toast ────────────────────────────────────── */
function status(text, puls, istFehler){
  const s = $('#status'); s.replaceChildren(); s.classList.toggle('fehler', !!istFehler);
  if(!text) return;
  if(puls){ const p = document.createElement('span'); p.className = 'puls'; s.append(p); }
  s.append(document.createTextNode(text));
}
let toastTimer;
function toast(text){
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  t.setAttribute('role', 'status'); document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 3600);
}

/* ── Geteilte Dateien (Share Target) & Offline-Hülle ───── */
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if(new URLSearchParams(location.search).has('geteilt') && 'caches' in window){
  (async () => {
    const c = await caches.open('ib-geteilt');
    const dateien = [];
    for(const req of await c.keys()){
      const r = await c.match(req);
      const name = decodeURIComponent(new URL(req.url).searchParams.get('n') || 'Seite');
      dateien.push(new File([await r.blob()], name, { type: r.headers.get('Content-Type') || '' }));
      await c.delete(req);
    }
    history.replaceState(null, '', location.pathname);
    if(dateien.length) nimmAuf(dateien);
  })();
}
