/* Ink Bridge – Oberfläche. Kein Build-Schritt, läuft direkt im Browser. */

import { MODI, nutzerText } from './lib/prompts.mjs';
import { ausDrop, aufnehmen, alleNotizen, baum, ordnerFinden, ordnerLoeschen,
         leeren as bibLeerenAlles, groesseText, istBrauchbar } from './bibliothek.js';
import { werkzeugAusfuehren } from './werkzeuge-client.js';

const $ = s => document.querySelector(s);
const KOERPER_GRENZE = 3_400_000;   // ab hier wird der Verlauf verdichtet
const WERKZEUG_RUNDEN = 40;         // Notbremse gegen Endlosschleifen

const zustand = {
  modus: lies('ib.modus') || 'fragen',
  auswahl: new Set(),
  eintraege: [],
  offen: new Set(JSON.parse(lies('ib.offen') || '[]')),
  suche: '',
  messages: [],
  antwort: '',
  laeuft: null,
  pdf: { muster: lies('ib.muster') || 'liniert', thema: lies('ib.thema') || 'hell', format: lies('ib.format') || 'a4', rand: lies('ib.rand') !== '0' },
};

function lies(k){ try { return localStorage.getItem(k); } catch { return null; } }
function schreib(k, v){ try { localStorage.setItem(k, v); } catch {} }
const code = () => lies('ib.code') || '';
const uid = () => Math.random().toString(36).slice(2, 10);

/* ── Thema ─────────────────────────────────────────────── */
const gespeichertesThema = lies('ib.ui');
if(gespeichertesThema) document.documentElement.dataset.theme = gespeichertesThema;
$('#themaWechsel').addEventListener('click', () => {
  const dunkel = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const neu = dunkel ? 'light' : 'dark';
  document.documentElement.dataset.theme = neu; schreib('ib.ui', neu);
});

/* ── Modi ──────────────────────────────────────────────── */
const modiBox = $('#modi');
modiBox.setAttribute('role', 'radiogroup'); modiBox.setAttribute('aria-label', 'Modus');
const MODUS_IDS = Object.keys(MODI);
for(const id of MODUS_IDS){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = id; b.setAttribute('role', 'radio');
  b.innerHTML = `<i aria-hidden="true">${MODI[id].kurz}</i>${MODI[id].titel}`;
  b.addEventListener('click', () => setzeModus(id));
  modiBox.append(b);
}
modiBox.addEventListener('keydown', e => {
  if(!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const i = MODUS_IDS.indexOf(zustand.modus);
  const n = MODUS_IDS[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : MODUS_IDS.length - 1)) % MODUS_IDS.length];
  setzeModus(n); modiBox.querySelector(`[data-id="${n}"]`).focus();
});
function setzeModus(id){
  if(!MODI[id]) id = 'fragen';
  zustand.modus = id; schreib('ib.modus', id);
  for(const b of modiBox.children){
    const an = b.dataset.id === id;
    b.setAttribute('aria-checked', an); b.tabIndex = an ? 0 : -1;
  }
  const label = $('#wunschLabel');
  if(id === 'fragen') label.textContent = 'Deine Frage an die Bibliothek';
  else if(id === 'schreiben') label.textContent = 'Was soll auf die neue Seite?';
  else label.innerHTML = 'Zusatzwunsch <span class="leise">(optional)</span>';
  $('#wunsch').placeholder = id === 'schreiben' ? 'z. B. „Lernblatt Photosynthese für die 9. Klasse mit Übungen“'
    : id === 'fragen' ? 'z. B. „Was hatte ich mir für das Treffen mit Herrn Wolf notiert?“'
    : 'z. B. „Nur Kapitel 2“, „auf Englisch“, „für die Klausur am Montag“';
}
setzeModus(zustand.modus);

/* ── Bibliothek füllen ─────────────────────────────────── */
const ablage = $('#ablage');
$('#ordnerAuf').addEventListener('click', () => $('#ordnerwahl').click());
$('#dateienAuf').addEventListener('click', () => $('#dateiwahl').click());
ablage.addEventListener('click', () => $('#ordnerwahl').click());
ablage.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); $('#ordnerwahl').click(); } });
for(const id of ['#ordnerwahl', '#dateiwahl']){
  $(id).addEventListener('change', async e => {
    const liste = [...e.target.files].map(f => ({ datei: f, pfad: (f.webkitRelativePath || f.name) }));
    e.target.value = '';
    await aufnehmenUndZeigen(liste);
  });
}
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => {
  if(!e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault(); ablage.classList.add('drueber');
}));
['dragleave', 'drop'].forEach(t => document.addEventListener(t, e => { if(t === 'drop') e.preventDefault(); ablage.classList.remove('drueber'); }));
document.addEventListener('drop', async e => {
  if(!e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  await aufnehmenUndZeigen(await ausDrop(e.dataTransfer));
});
document.addEventListener('paste', async e => {
  const f = [...(e.clipboardData?.files || [])];
  if(f.length){ e.preventDefault(); await aufnehmenUndZeigen(f.map(d => ({ datei: d, pfad: d.name }))); }
});

async function aufnehmenUndZeigen(liste){
  if(!liste.length) return;
  const brauchbar = liste.filter(x => istBrauchbar(x.pfad));
  if(!brauchbar.length) return toast('Darin waren keine PDFs oder Bilder.');
  try {
    status(`Nimmt ${brauchbar.length} Notizbücher auf …`, true);
    const { neu } = await aufnehmen(brauchbar, (i, ges, name) => status(`Nimmt auf: ${name} (${i} von ${ges})`, true));
    await bibliothekZeigen();
    for(const n of neu) zustand.auswahl.add(n.pfad);
    for(const n of neu){               // alle Ordner der neuen Notizbücher aufklappen
      const teile = n.ordner ? n.ordner.split('/') : [];
      for(let i = 1; i <= teile.length; i++) zustand.offen.add(teile.slice(0, i).join('/'));
    }
    baumZeichnen();
    status('');
    toast(`${neu.length} Notizbücher aufgenommen.`);
  } catch(e){
    console.error(e);
    status('Die Dateien ließen sich nicht aufnehmen: ' + (e?.message || 'unbekannter Fehler'), false, true);
  }
}

async function bibliothekZeigen(){
  zustand.eintraege = await alleNotizen();
  const voll = zustand.eintraege.length > 0;
  $('#bib').hidden = !voll;
  ablage.classList.toggle('ablage-klein', voll);
  const seiten = zustand.eintraege.reduce((s, e) => s + (e.seiten || 1), 0);
  const bytes = zustand.eintraege.reduce((s, e) => s + e.groesse, 0);
  $('#kopfZahl').textContent = voll ? `${zustand.eintraege.length} Notizbücher · ${seiten} Seiten` : '';
  $('#bibZahl').textContent = voll ? `${zustand.eintraege.length} Notizbücher · ${seiten} Seiten · ${groesseText(bytes)} auf diesem Gerät` : '';
  baumZeichnen();
}

/* ── Baum zeichnen ─────────────────────────────────────── */
const baumBox = $('#baum');
$('#bibSuche').addEventListener('input', e => { zustand.suche = e.target.value.trim().toLowerCase(); baumZeichnen(); });
$('#allesAb').addEventListener('click', () => { zustand.auswahl.clear(); baumZeichnen(); });
$('#bibLeeren').addEventListener('click', async () => {
  if(!confirm('Alle Notizbücher aus der Bibliothek entfernen? Die Dateien auf deinem Gerät bleiben erhalten.')) return;
  await bibLeerenAlles(); zustand.auswahl.clear(); await bibliothekZeigen();
});

function baumZeichnen(){
  const gefiltert = zustand.suche
    ? zustand.eintraege.filter(e => e.pfad.toLowerCase().includes(zustand.suche))
    : zustand.eintraege;
  baumBox.replaceChildren();
  if(!gefiltert.length){
    const p = document.createElement('p'); p.className = 'leise baum-leer';
    p.textContent = zustand.suche ? 'Keine Treffer.' : 'Noch nichts in der Bibliothek.';
    baumBox.append(p);
  } else {
    baumBox.append(knotenBauen(baum(gefiltert), 0, !!zustand.suche));
  }
  const n = zustand.auswahl.size;
  $('#allesAb').hidden = !n;
  $('#los').querySelector('.los-text').textContent = zustand.laeuft ? 'Abbrechen (Esc)'
    : n ? `Claude losschicken · ${n} ausgewählt` : 'Claude losschicken';
  schreib('ib.offen', JSON.stringify([...zustand.offen]));
}

function knotenBauen(knoten, tiefe, allesOffen){
  const frag = document.createDocumentFragment();
  for(const u of [...knoten.ordner.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))){
    const offen = allesOffen || zustand.offen.has(u.pfad);
    const d = document.createElement('details'); d.className = 'ordner'; d.open = offen;
    d.style.setProperty('--t', tiefe);
    d.addEventListener('toggle', () => { d.open ? zustand.offen.add(u.pfad) : zustand.offen.delete(u.pfad); schreib('ib.offen', JSON.stringify([...zustand.offen])); });
    const s = document.createElement('summary');
    const alle = dateienVon(u);
    const hk = document.createElement('input'); hk.type = 'checkbox'; hk.className = 'haken';
    hk.checked = alle.length > 0 && alle.every(f => zustand.auswahl.has(f.pfad));
    hk.indeterminate = !hk.checked && alle.some(f => zustand.auswahl.has(f.pfad));
    hk.setAttribute('aria-label', `Ordner ${u.name} auswählen`);
    hk.addEventListener('click', e => e.stopPropagation());
    hk.addEventListener('change', () => { for(const f of alle) hk.checked ? zustand.auswahl.add(f.pfad) : zustand.auswahl.delete(f.pfad); baumZeichnen(); });
    const name = document.createElement('span'); name.className = 'knoten-name'; name.textContent = u.name;
    const zahl = document.createElement('span'); zahl.className = 'knoten-zahl'; zahl.textContent = `${alle.length} · ${u.seiten} S.`;
    const weg = document.createElement('button'); weg.type = 'button'; weg.className = 'weg'; weg.textContent = '✕';
    weg.setAttribute('aria-label', `Ordner ${u.name} entfernen`);
    weg.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      for(const f of alle) zustand.auswahl.delete(f.pfad);
      await ordnerLoeschen(u.pfad); await bibliothekZeigen();
    });
    s.append(hk, name, zahl, weg); d.append(s);
    const innen = document.createElement('div'); innen.className = 'ordner-innen';
    innen.append(knotenBauen(u, tiefe + 1, allesOffen));
    d.append(innen);
    frag.append(d);
  }
  for(const f of knoten.dateien) frag.append(dateiZeile(f, tiefe));
  return frag;
}
const dateienVon = k => [...k.dateien, ...[...k.ordner.values()].flatMap(dateienVon)];

function dateiZeile(f, tiefe){
  const l = document.createElement('label'); l.className = 'datei-zeile'; l.style.setProperty('--t', tiefe);
  const hk = document.createElement('input'); hk.type = 'checkbox'; hk.className = 'haken';
  hk.checked = zustand.auswahl.has(f.pfad);
  hk.addEventListener('change', () => { hk.checked ? zustand.auswahl.add(f.pfad) : zustand.auswahl.delete(f.pfad); baumZeichnen(); });
  const name = document.createElement('span'); name.className = 'knoten-name'; name.textContent = f.name;
  const zahl = document.createElement('span'); zahl.className = 'knoten-zahl';
  zahl.textContent = f.seiten ? `${f.seiten} S.` : groesseText(f.groesse);
  l.append(hk, name, zahl);
  return l;
}

/* ── Gespräch ──────────────────────────────────────────── */
const lauf = $('#lauf'), blatt = $('#blatt'), editor = $('#editor');
let aktuelleBlase = null;

$('#los').addEventListener('click', () => zustand.laeuft ? zustand.laeuft.abort() : starten());
$('#neu').addEventListener('click', neuesGespraech);
$('#nachfrageForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#nachfrage').value.trim();
  if(!t || zustand.laeuft) return;
  $('#nachfrage').value = '';
  fuehren([{ type: 'text', text: t }], t);
});
document.addEventListener('keydown', e => {
  if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); if(!zustand.laeuft) starten(); }
  if(e.key === 'Escape' && zustand.laeuft) zustand.laeuft.abort();
});

function neuesGespraech(){
  if(zustand.laeuft) return;
  zustand.messages = []; zustand.antwort = '';
  lauf.replaceChildren(); aktuelleBlase = null;
  bearbeiten(false); $('#leer').hidden = false; $('#nachfrageForm').hidden = true;
  aktionenAn(false); $('#neu').disabled = true; status('');
}

function starten(){
  const frage = $('#wunsch').value.trim();
  if(zustand.modus === 'schreiben' && !frage) { $('#wunsch').focus(); return status('Beschreibe kurz, was auf die Seite soll.', false, true); }
  if(zustand.modus === 'fragen' && !frage) { $('#wunsch').focus(); return status('Bitte eine Frage eingeben.', false, true); }
  if(!zustand.eintraege.length && zustand.modus !== 'schreiben'){ ablage.focus(); return status('Zieh zuerst deine Goodnotes-Ordner hinein.', false, true); }
  if(zustand.messages.length) neuesGespraech();

  const auswahl = [...zustand.auswahl].map(p => {
    const e = zustand.eintraege.find(x => x.pfad === p);
    return { pfad: p, seiten: e?.seiten || 0 };
  });
  const text = nutzerText(zustand.modus, frage, auswahl);
  const zeile = `${MODI[zustand.modus].titel}${auswahl.length ? ` · ${auswahl.length} Notizbücher` : zustand.modus === 'schreiben' ? '' : ' · ganze Bibliothek'}`;
  fuehren([{ type: 'text', text }], frage || zeile, zeile);
}

/** Schickt eine Nutzer-Nachricht und führt die Werkzeugschleife aus. */
async function fuehren(inhalt, anzeige, beiwerk){
  const ctrl = new AbortController(); zustand.laeuft = ctrl;
  $('#leer').hidden = true; $('#neu').disabled = false; bearbeiten(false);
  $('#los').classList.add('arbeitet'); document.body.classList.add('fliesst');
  baumZeichnen(); aktionenAn(false);
  blaseNutzer(anzeige, beiwerk);
  zustand.messages.push({ role: 'user', content: inhalt });
  if(matchMedia('(max-width: 980px)').matches) blatt.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let fehler = null;
  try {
    for(let runde = 0; runde < WERKZEUG_RUNDEN; runde++){
      verdichten();
      const zug = await einZug(ctrl.signal);
      if(zug.fehler){ fehler = zug.fehler; break; }
      zustand.messages.push({ role: 'assistant', content: zug.content });
      const aufrufe = zug.content.filter(b => b.type === 'tool_use');
      if(!aufrufe.length) break;
      const ergebnisse = [];
      for(const a of aufrufe){
        const zeile = werkzeugZeile(a);
        const block = await werkzeugAusfuehren(a, (t, f) => { zeile.textContent = t; status(t, true, false, f); });
        zeile.classList.add(block.is_error ? 'werkzeug-fehler' : 'werkzeug-fertig');
        if(block.is_error) zeile.textContent = textVon(block) || 'Fehlgeschlagen.';
        ergebnisse.push(block);
        if(ctrl.signal.aborted) break;
      }
      if(ctrl.signal.aborted){ fehler = 'Abgebrochen.'; break; }
      zustand.messages.push({ role: 'user', content: ergebnisse });
      status('Claude denkt nach', true);
      if(runde === WERKZEUG_RUNDEN - 1) fehler = 'Claude hat sehr viele Seiten gelesen und wurde gestoppt. Frag gezielter nach.';
    }
  } catch(e){
    fehler = e.name === 'AbortError' ? 'Abgebrochen.' : (e.message || 'Unerwarteter Fehler.');
  }

  zustand.laeuft = null;
  $('#los').classList.remove('arbeitet'); document.body.classList.remove('fliesst');
  aktuelleBlase?.classList.remove('schreibt'); aktuelleBlase = null;
  baumZeichnen();
  status(fehler || '', false, !!fehler);
  $('#nachfrageForm').hidden = !zustand.messages.length;

  const letzte = letzteAntwort();
  if(letzte){
    zustand.antwort = letzte; aktionenAn(true);
    const t = $('#pdfTitel');
    if(!t.value || t.dataset.auto){
      const h = letzte.match(/^#\s+(.+)$/m);
      if(h){ t.value = h[1].replace(/[*_`]/g, '').slice(0, 120); t.dataset.auto = '1'; }
    }
    if(!fehler) merken();
  }
}

/** Ein Zug: Anfrage an den Server, Text streamen, Antwortblöcke sammeln. */
async function einZug(signal){
  status('Claude denkt nach', true);
  const r = await api('api/chat', { messages: zustand.messages, modus: zustand.modus }, signal);
  if(r.status === 401) return { fehler: 'Ohne gültigen Zugangscode geht es nicht weiter.' };
  if(!r.ok) return { fehler: (await r.json().catch(() => ({}))).message || `Fehler ${r.status}` };

  const leser = r.body.getReader(); const dec = new TextDecoder();
  let puffer = '', text = '', ergebnis = null, fehler = null;
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
        if(!text) status('Claude schreibt', true);
        text += ev.d; blaseText(text);
      } else if(ev.t === 'zug') ergebnis = ev;
      else if(ev.t === 'error') fehler = ev.message;
    }
  }
  if(fehler) return { fehler };
  if(!ergebnis) return { fehler: 'Die Verbindung ist abgerissen.' };
  if(text) aktuelleBlase?.classList.remove('schreibt');
  aktuelleBlase = null;
  return ergebnis;
}

/* ── Verlauf verdichten ────────────────────────────────── */
/* Wird die Anfrage zu groß, nehmen wir Seitenbilder aus älteren
   Werkzeug-Ergebnissen heraus. Claude kann sie bei Bedarf erneut lesen.
   Dabei fallen auch die Gedankenblöcke weg, die sonst ungültig würden. */
function verdichten(){
  if(JSON.stringify(zustand.messages).length <= KOERPER_GRENZE) return;
  let geschont = 2;
  for(let i = zustand.messages.length - 1; i >= 0; i--){
    const n = zustand.messages[i];
    if(!Array.isArray(n.content)) continue;
    if(n.role === 'assistant'){
      n.content = n.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking');
      if(!n.content.length) n.content = [{ type: 'text', text: '…' }];
      continue;
    }
    const hatBilder = n.content.some(b => b.type === 'tool_result' && Array.isArray(b.content) && b.content.some(c => c.type === 'image'));
    if(!hatBilder) continue;
    if(geschont-- > 0) continue;
    for(const b of n.content){
      if(b.type !== 'tool_result' || !Array.isArray(b.content)) continue;
      let bilder = 0;
      b.content = b.content.filter(c => { if(c.type === 'image'){ bilder++; return false; } return true; });
      if(bilder) b.content.push({ type: 'text', text: `[${bilder} Seitenbilder wurden aus dem Verlauf entfernt. Lies sie bei Bedarf mit notiz_lesen erneut.]` });
    }
    if(JSON.stringify(zustand.messages).length <= KOERPER_GRENZE) return;
  }
}

/* ── Gesprächsansicht ──────────────────────────────────── */
function blaseNutzer(text, beiwerk){
  const d = document.createElement('div'); d.className = 'blase blase-nutzer';
  if(beiwerk){ const s = document.createElement('small'); s.textContent = beiwerk; d.append(s); }
  const p = document.createElement('p'); p.textContent = text; d.append(p);
  lauf.append(d); nachUnten();
}
function werkzeugZeile(aufruf){
  const d = document.createElement('div'); d.className = 'werkzeug';
  const i = document.createElement('i'); i.setAttribute('aria-hidden', 'true');
  i.textContent = aufruf.name === 'notiz_lesen' ? '◉' : aufruf.name === 'notizen_suchen' ? '⌕' : '⌗';
  const t = document.createElement('span');
  t.textContent = aufruf.name === 'notiz_lesen' ? `Öffnet ${String(aufruf.input?.pfad || '').split('/').pop()}`
    : aufruf.name === 'notizen_suchen' ? `Sucht nach „${aufruf.input?.begriff || ''}“` : 'Sieht sich in der Bibliothek um';
  d.append(i, t); lauf.append(d); nachUnten();
  return t;
}
function blaseText(text){
  if(!aktuelleBlase){
    aktuelleBlase = document.createElement('div');
    aktuelleBlase.className = 'md schreibt';
    lauf.append(aktuelleBlase);
  }
  const unten = blatt.scrollHeight - blatt.scrollTop - blatt.clientHeight < 90;
  aktuelleBlase.innerHTML = rendern(text);
  aktuelleBlase.dataset.md = text;
  if(unten) nachUnten();
}
function nachUnten(){ blatt.scrollTop = blatt.scrollHeight; }
function rendern(md){
  if(window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(md, { gfm: true, breaks: false }));
  const p = document.createElement('pre'); p.textContent = md; return p.outerHTML;
}
const textVon = block => (Array.isArray(block.content) ? block.content : []).filter(c => c.type === 'text').map(c => c.text).join(' ').slice(0, 160);
function letzteAntwort(){
  const blasen = [...lauf.querySelectorAll('.md')];
  return blasen.at(-1)?.dataset.md || '';
}

/* ── Bearbeiten / Kopieren ─────────────────────────────── */
$('#bearbeiten').addEventListener('click', () => bearbeiten(editor.hidden));
function bearbeiten(an){
  if(!an && !editor.hidden){
    zustand.antwort = editor.value;
    const letzte = [...lauf.querySelectorAll('.md')].at(-1);
    if(letzte){ letzte.dataset.md = zustand.antwort; letzte.innerHTML = rendern(zustand.antwort); }
    merken(true);
  }
  editor.hidden = !an; lauf.hidden = an;
  $('#bearbeiten').setAttribute('aria-pressed', an);
  $('#bearbeiten').textContent = an ? 'Fertig' : 'Bearbeiten';
  if(an){ editor.value = zustand.antwort; editor.style.height = Math.max(440, blatt.clientHeight - 60) + 'px'; editor.focus(); }
}
$('#kopieren').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(aktuellerText()); toast('Markdown kopiert.'); }
  catch { toast('Kopieren nicht erlaubt.'); }
});
const aktuellerText = () => editor.hidden ? zustand.antwort : editor.value;
function aktionenAn(an){ for(const id of ['#bearbeiten', '#kopieren', '#teilen', '#laden']) $(id).disabled = !an; }

/* ── PDF zurück nach Goodnotes ─────────────────────────── */
function segment(box, schluessel){
  const el = $(box);
  const setze = v => { zustand.pdf[schluessel] = v; schreib('ib.' + schluessel, v);
    for(const b of el.children) b.setAttribute('aria-checked', b.dataset.v === v); };
  el.addEventListener('click', e => { const b = e.target.closest('button'); if(b) setze(b.dataset.v); });
  setze(zustand.pdf[schluessel]);
}
segment('#optMuster', 'muster'); segment('#optThema', 'thema');
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
  return new File([await r.blob()], dateiname(titel), { type: 'application/pdf' });
}
function dateiname(titel){
  const s = titel.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 80);
  return (s || 'Goodnotes-Seite') + '.pdf';
}
$('#teilen').addEventListener('click', async e => {
  const knopf = e.currentTarget; knopf.disabled = true;
  try {
    const datei = await pdfHolen();
    if(navigator.canShare?.({ files: [datei] })){
      try { await navigator.share({ files: [datei], title: datei.name }); toast('Im Teilen-Menü „Goodnotes“ wählen.'); }
      catch(err){ if(err.name !== 'AbortError') herunterladen(datei); }
    } else { herunterladen(datei); toast('PDF geladen – in Goodnotes über „Importieren“ öffnen.'); }
  } catch(err){ status(err.message, false, true); }
  knopf.disabled = false;
});
$('#laden').addEventListener('click', async e => {
  const knopf = e.currentTarget; knopf.disabled = true;
  try { herunterladen(await pdfHolen()); } catch(err){ status(err.message, false, true); }
  knopf.disabled = false;
});
function herunterladen(datei){
  const url = URL.createObjectURL(datei);
  const a = Object.assign(document.createElement('a'), { href: url, download: datei.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ── Verlauf (Antworten) ───────────────────────────────── */
function verlaufLesen(){ try { return JSON.parse(lies('ib.verlauf') || '[]'); } catch { return []; } }
let letzterEintrag = null;
function merken(aktualisieren){
  const md = aktuellerText(); if(!md.trim()) return;
  const liste = verlaufLesen();
  const titel = ($('#pdfTitel').value || md.match(/^#\s+(.+)$/m)?.[1] || 'Ohne Titel').slice(0, 90);
  if(aktualisieren && letzterEintrag){
    const e = liste.find(x => x.id === letzterEintrag);
    if(e){ e.md = md; e.titel = titel; }
  } else {
    letzterEintrag = uid();
    liste.unshift({ id: letzterEintrag, titel, modus: zustand.modus, zeit: Date.now(), md });
  }
  schreib('ib.verlauf', JSON.stringify(liste.slice(0, 25)));
}
$('#verlaufAuf').addEventListener('click', () => {
  const ol = $('#verlaufListe'); ol.replaceChildren();
  for(const e of verlaufLesen()){
    const li = document.createElement('li'); const b = document.createElement('button');
    const t = document.createElement('strong'); t.textContent = e.titel;
    const s = document.createElement('small');
    s.textContent = `${MODI[e.modus]?.titel || ''} · ${new Date(e.zeit).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`;
    b.append(t, s);
    b.addEventListener('click', () => {
      neuesGespraech();
      zustand.antwort = e.md; letzterEintrag = e.id;
      $('#leer').hidden = true;
      const d = document.createElement('div'); d.className = 'md'; d.dataset.md = e.md; d.innerHTML = rendern(e.md);
      lauf.append(d); aktionenAn(true); $('#pdfTitel').value = e.titel; $('#verlauf').close();
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
  $('#zugangFehler').hidden = !falsch;
  $('#zugangFehler').textContent = falsch ? 'Der Code stimmt nicht. Bitte erneut eingeben.' : '';
  $('#zugangCode').value = '';
  if(!d.open) d.showModal();
  return new Promise(ok => d.addEventListener('close', () => {
    const v = $('#zugangCode').value.trim();
    if(d.returnValue === 'ok' && v){ schreib('ib.code', v); ok(true); } else ok(false);
  }, { once: true }));
}

/* ── Status & Toast ────────────────────────────────────── */
function status(text, puls, istFehler, fortschritt){
  const s = $('#status'); s.replaceChildren(); s.classList.toggle('fehler', !!istFehler);
  if(!text) return;
  if(puls){ const p = document.createElement('span'); p.className = 'puls'; s.append(p); }
  s.append(document.createTextNode(text));
  if(fortschritt?.ges > 1){
    const b = document.createElement('span'); b.className = 'balken';
    b.style.setProperty('--p', Math.round(fortschritt.n / fortschritt.ges * 100) + '%');
    s.append(b);
  }
}
let toastTimer;
function toast(text){
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  t.setAttribute('role', 'status'); document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 3600);
}

/* ── Start ─────────────────────────────────────────────── */
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
bibliothekZeigen().catch(e => { console.error(e); status('Die Bibliothek ließ sich nicht öffnen.', false, true); });

if(new URLSearchParams(location.search).has('geteilt') && 'caches' in window){
  (async () => {
    const c = await caches.open('ib-geteilt');
    const dateien = [];
    for(const req of await c.keys()){
      const r = await c.match(req);
      const name = decodeURIComponent(new URL(req.url).searchParams.get('n') || 'Seite');
      dateien.push({ datei: new File([await r.blob()], name, { type: r.headers.get('Content-Type') || '' }), pfad: name });
      await c.delete(req);
    }
    history.replaceState(null, '', location.pathname);
    if(dateien.length) aufnehmenUndZeigen(dateien);
  })();
}
