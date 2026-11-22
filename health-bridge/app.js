import { balken, stapel, linie, fenster, spark, leer, tagKurz, divergierend } from './diagramme.js';
import { bodybuilding as bbKern, tagPlus, tagesListe, phaseAm, tagTyp, PHASEN as PHASE_TITEL } from './kern/rechnen.mjs';
import { analyse as analyseKern } from './kern/analyse.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SPEICHER = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const ZOOM = [7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365];

const zustand = { tage: Number(SPEICHER.get('puls.tage')) || 30, code: SPEICHER.get('puls.code') || '', roh: null, daten: null, analyse: null };

const zahl = (v, nk = 0) => v == null ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: nk, minimumFractionDigits: 0 });
const dauer = min => min == null ? '–' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
const mittel = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const farbe = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();

/* ── Vorschau: Beispieldaten ohne Server und ohne Verbindung ── */
const VORSCHAU = document.querySelector('meta[name="puls-modus"]')?.content === 'vorschau' || new URLSearchParams(location.search).has('vorschau');
const lokal = {
  lesen(k){ try { return JSON.parse(SPEICHER.get(k)); } catch { return null; } },
  schreiben(k, v){ SPEICHER.set(k, JSON.stringify(v)); },
};

/* ── Laden: Rohbasis holen, gerechnet wird hier im Browser ── */
async function rohLaden(tage){
  if(VORSCHAU){
    try {
      const j = await (await fetch('vorschau-daten/roh.json')).json();
      const e = lokal.lesen('puls.vorschau.einstellungen'); if(e?.ziele) j.einstellungen = { ...j.einstellungen, ...e, ziele: { ...j.einstellungen.ziele, ...e.ziele } };
      const p = lokal.lesen('puls.vorschau.protokoll'); if(Array.isArray(p)) j.protokoll = p;
      return j;
    } catch { $('#satz').textContent = 'Die Beispieldaten konnten nicht geladen werden.'; return null; }
  }
  document.body.classList.add('laedt');
  const r = await fetch(`/api/daten?tage=${tage}`, { headers: { 'x-puls-code': zustand.code } }).catch(() => null);
  document.body.classList.remove('laedt');
  if(!r){ $('#satz').textContent = 'Keine Verbindung – angezeigt wird der letzte Stand.'; return null; }
  if(r.status === 401){ schloss(true); return null; }
  const j = await r.json().catch(() => ({}));
  if(!r.ok){ $('#satz').textContent = j.message || 'Die Daten konnten nicht geladen werden.'; return null; }
  return j;
}

/** Sicht auf ein Fenster der Rohbasis – ohne Netz, deshalb flüssig beim Zoomen. */
function ansicht(roh, tage){
  const bis = roh.heute, von = tagPlus(bis, -(tage - 1));
  const reihen = {};
  for(const [m, l] of Object.entries(roh.basis.reihen)) reihen[m] = l.filter(p => p.tag >= von && p.tag <= bis);
  zustand.analyse ||= analyseKern(roh.basis, roh.einstellungen, roh.protokoll, bis);
  return { zeitraum: { von, bis }, tage: tagesListe(von, bis), reihen, zeitzone: roh.zeitzone, letzterSync: roh.letzterSync,
    schlaf: roh.basis.schlaf.filter(n => n.nacht >= von && n.nacht <= bis), workouts: roh.basis.workouts.filter(w => w.tag >= von && w.tag <= bis),
    einstellungen: roh.einstellungen, protokoll: roh.protokoll, meta: roh.meta,
    bodybuilding: bbKern(roh.basis, { von, bis }, roh.einstellungen, roh.protokoll), analyse: zustand.analyse };
}

async function aktualisieren({ neu = false } = {}){
  if(neu || !zustand.roh || zustand.tage > zustand.roh.tage_geladen){
    const roh = await rohLaden(Math.max(zustand.tage, 90));
    if(!roh) return false;
    zustand.roh = roh; zustand.analyse = null;
  }
  zustand.daten = ansicht(zustand.roh, Math.min(zustand.tage, zustand.roh.tage_geladen));
  zeichnen();
  return true;
}

/** Einstellungen oder Protokoll haben sich geändert: neu rechnen, ohne neu zu laden. */
function neuRechnen(){ zustand.analyse = null; zustand.daten = ansicht(zustand.roh, Math.min(zustand.tage, zustand.roh.tage_geladen)); zeichnen(); }

function schloss(an, fehler = ''){
  $('#schloss').hidden = !an;
  $('#schloss-fehler').textContent = fehler;
  if(an) setTimeout(() => $('#code').focus(), 50);
}

$('#schloss-form').addEventListener('submit', async e => {
  e.preventDefault();
  zustand.code = $('#code').value.trim();
  if(!await aktualisieren({ neu: true })) return schloss(true, 'Der Code stimmt nicht.');
  SPEICHER.set('puls.code', zustand.code);
  schloss(false);
});

/* ── Werte holen ───────────────────────────────────────── */
const reihe = (name, d = zustand.daten) => { const m = new Map((d.reihen[name] || []).map(p => [p.tag, p])); return d.tage.map(t => m.get(t)?.wert ?? null); };
const spanne = (name, d = zustand.daten) => { const m = new Map((d.reihen[name] || []).map(p => [p.tag, p])); return d.tage.map(t => m.get(t) || null); };
const schlafReihe = (feld, d = zustand.daten) => { const m = new Map(d.schlaf.map(n => [n.nacht, n])); return d.tage.map(t => m.get(t)?.[feld] ?? null); };
const letzter = werte => { for(let i = werte.length - 1; i >= 0; i--) if(werte[i] != null) return werte[i]; return null; };

/** Letzter Wert vs. Mittel des Zeitraums. hoch = gut? */
function delta(werte, hochGut = true, fmt = v => zahl(v)){
  const l = letzter(werte), m = mittel(werte.slice(0, werte.lastIndexOf(l)));
  if(l == null || m == null || !m) return '';
  const p = (l - m) / Math.abs(m) * 100;
  if(Math.abs(p) < 1) return `<span class="delta">≈ Ø ${fmt(m)}</span>`;
  const gut = hochGut == null ? '' : (p > 0) === hochGut ? 'gut' : 'schlecht';
  return `<span class="delta ${gut}">${p > 0 ? '↑' : '↓'} ${zahl(Math.abs(p))} % zu Ø</span>`;
}

/* ── Zeichnen ──────────────────────────────────────────── */
function zeichnen(){
  const d = zustand.daten; if(!d) return;
  try { zeichnenInnen(d); } catch(err){ console.error(err); }
}
function zeichnenInnen(d){
  zoomKnoepfe();
  ordnen(d.einstellungen);
  held(d); vorlagenLeiste(d); kacheln(d); analyseBereich(d); protokollBereich(d); aufbau(d); training(d); schlaf(d); herz(d); aktivitaet(d); ernaehrung(d);
  $('#fuss-zone').textContent = `${tagKurz(d.zeitraum.von)} – ${tagKurz(d.zeitraum.bis)} · ${d.zeitzone}`;
}

function held(d){
  const jetzt = new Date(), h = jetzt.getHours();
  $('#datum').textContent = jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#gruss').textContent = h < 5 ? 'Gute Nacht.' : h < 11 ? 'Guten Morgen.' : h < 18 ? 'Guten Tag.' : 'Guten Abend.';
  const nacht = d.schlaf.at(-1), schlafMittel = mittel(d.schlaf.map(n => n.gesamt_min));
  const rhr = reihe('resting_heart_rate'), hrv = reihe('heart_rate_variability'), schritte = reihe('step_count');
  const teile = [];
  if(nacht){
    const vgl = schlafMittel ? nacht.gesamt_min - schlafMittel : 0;
    teile.push(`Letzte Nacht hast du <b>${dauer(nacht.gesamt_min)}</b> geschlafen${Math.abs(vgl) >= 10 ? ` – ${zahl(Math.abs(vgl))} min ${vgl > 0 ? 'mehr' : 'weniger'} als im Schnitt` : ', genau dein Schnitt'}.`);
  }
  if(letzter(hrv) != null && letzter(rhr) != null) teile.push(`Ruhepuls <b>${zahl(letzter(rhr))}</b>, HRV <b>${zahl(letzter(hrv))} ms</b>.`);
  const s = mittel(schritte);
  if(s) teile.push(`Im Schnitt <b>${zahl(s)}</b> Schritte am Tag.`);
  $('#satz').innerHTML = teile.join(' ') || 'Noch keine Daten. Richte den Sync auf dem iPhone ein – oben rechts unter „Claude“ findest du die Adressen.';
  const sy = $('#sync'), ls = d.letzterSync;
  if(ls){
    const std = (Date.now() - new Date(ls.zeit)) / 36e5;
    sy.className = 'sync ' + (std < 30 ? 'frisch' : 'alt');
    sy.querySelector('span').textContent = `Synchronisiert ${std < 1 ? 'vor ' + Math.max(1, Math.round(std * 60)) + ' min' : std < 48 ? 'vor ' + Math.round(std) + ' h' : 'am ' + new Date(ls.zeit).toLocaleDateString('de-DE')}`;
  } else { sy.className = 'sync'; sy.querySelector('span').textContent = 'Noch kein Sync'; }
  pulslinie(rhr, hrv);
}

/** Signatur: eine Pulslinie über dem Kopf, gezeichnet aus Ruhepuls und HRV des Zeitraums. */
function pulslinie(rhr, hrv){
  const svg = $('#pulslinie'); const b = svg.clientWidth || 1000, h = 170;
  svg.setAttribute('viewBox', `0 0 ${b} ${h}`);
  const pfad = (werte, amp, phase) => {
    const v = werte.filter(x => x != null); if(v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
    let p = '', i = 0; const n = werte.length, schritt = b / n;
    for(let k = 0; k < n; k++){
      const x = k * schritt, w = werte[k] ?? (lo + hi) / 2, y = h / 2 + ((w - lo) / sp - .5) * amp;
      if(k % 3 === phase){ p += `${i++ ? 'L' : 'M'}${x.toFixed(1)},${(h / 2).toFixed(1)} L${(x + schritt * .3).toFixed(1)},${(y - amp * .6).toFixed(1)} L${(x + schritt * .5).toFixed(1)},${(y + amp * .5).toFixed(1)} L${(x + schritt * .7).toFixed(1)},${(h / 2).toFixed(1)} `; }
      else p += `${i++ ? 'L' : 'M'}${x.toFixed(1)},${(h / 2 + ((w - lo) / sp - .5) * 10).toFixed(1)} `;
    }
    return p;
  };
  svg.innerHTML = `<path class="zieh" pathLength="1" stroke="${farbe('herz')}" d="${pfad(rhr, 90, 1)}"/><path class="zieh" pathLength="1" stroke="${farbe('schlaf')}" opacity=".7" d="${pfad(hrv, 60, 2)}" style="animation-delay:.5s"/>`;
}

/* ── Bereiche ordnen ───────────────────────────────────── */
const BEREICH_TITEL = { analyse: 'Coach', protokoll: 'Protokoll', aufbau: 'Aufbau', training: 'Training', ernaehrung: 'Ernährung', schlaf: 'Schlaf', herz: 'Herz', aktivitaet: 'Aktivität' };
function ordnen(e){
  const wrap = $('#bereiche'), nav = $('.sprung');
  const an = e.bereiche;
  wrap.querySelectorAll('[data-bereich]').forEach(sec => { sec.hidden = !an.includes(sec.dataset.bereich); });
  an.forEach((id, i) => { const sec = wrap.querySelector(`[data-bereich="${id}"]`); if(sec){ wrap.appendChild(sec); sec.querySelector('.nr').textContent = String(i + 1).padStart(2, '0'); } });
  nav.innerHTML = an.map(id => `<a href="#${id}">${BEREICH_TITEL[id]}</a>`).join('');
}

/* ── Kennzahl-Kacheln ──────────────────────────────────── */
const vorz = (v, nk = 0) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + zahl(Math.abs(v), nk);
const ffmiText = f => f == null ? '' : f < 18 ? 'unter Schnitt' : f < 20 ? 'durchschnittlich' : f < 22 ? 'überdurchschnittlich' : f < 23.5 ? 'sehr gut' : 'herausragend';

function kachelDef(id, d){
  const bb = d.bodybuilding, r = bb.reihen, z = d.einstellungen.ziele;
  const w = (v, e, nk = 0) => v == null ? '–' : `${zahl(v, nk)}${e ? `<small>${e}</small>` : ''}`;
  switch(id){
    case 'gewicht': return { name: 'Trendgewicht', f: 'koerper', wert: w(bb.gewicht.aktuell_trend_kg, 'kg', 1), werte: r.trend_kg, unter: `<span class="sub">Waage ${zahl(bb.gewicht.letzte_messung_kg, 1)}</span>` };
    case 'rate': { const g = bb.gewicht; return { name: 'Pro Woche', f: 'koerper', wert: g.rate_kg_woche == null ? '–' : `${vorz(g.rate_kg_woche, 2)}<small>kg</small>`, werte: r.trend_kg,
      unter: g.rate_prozent_woche == null ? '' : `<span class="delta ${g.im_plan ? 'gut' : 'schlecht'}">${vorz(g.rate_prozent_woche, 2)} % · Ziel ${vorz(g.ziel_rate_prozent_woche, 2)}</span>` }; }
    case 'protein_gkg': { const e = bb.eiweiss; return { name: 'Eiweiß / kg', f: 'mk-eiweiss', wert: w(e.mittel_g_pro_kg, 'g/kg', 2), werte: r.eiweiss_g_pro_kg,
      unter: e.mittel_g_pro_kg == null ? '' : `<span class="delta ${e.mittel_g_pro_kg >= e.ziel_g_pro_kg * .95 ? 'gut' : 'schlecht'}">Ziel ${zahl(e.ziel_g_pro_kg, 1)} · ${e.tage_ziel_erreicht}/${e.tage_geloggt} T</span>` }; }
    case 'bilanz': return { name: 'Energiebilanz Ø', f: 'plus', wert: bb.energie.bilanz_mittel_kcal == null ? '–' : `${vorz(bb.energie.bilanz_mittel_kcal)}<small>kcal</small>`, werte: r.bilanz_kcal, unter: `<span class="sub">${bb.energie.bilanz_mittel_kcal >= 0 ? 'Überschuss' : 'Defizit'}</span>` };
    case 'tdee': return { name: 'Verbrauch (TDEE)', f: 'ernaehrung', wert: w(bb.energie.tdee_kcal, 'kcal'), werte: r.verbrauch_kcal, unter: `<span class="sub">${bb.energie.tdee_methode?.startsWith('adaptiv') ? 'adaptiv' : 'Apple Health'}</span>` };
    case 'koerperfett': return { name: 'Körperfett', f: 'koerper', wert: w(bb.koerper.koerperfett_prozent, '%', 1), werte: reihe('body_fat_percentage'), unter: delta(reihe('body_fat_percentage'), false, v => zahl(v, 1)) };
    case 'magermasse': return { name: 'Magermasse', f: 'koerper', wert: w(bb.koerper.magermasse_kg, 'kg', 1), werte: r.magermasse_kg, unter: bb.koerper.magermasse_veraenderung_kg == null ? '' : `<span class="delta ${bb.koerper.magermasse_veraenderung_kg >= 0 ? 'gut' : 'schlecht'}">${vorz(bb.koerper.magermasse_veraenderung_kg, 1)} kg</span>` };
    case 'ffmi': return { name: 'FFMI', f: 'koerper', wert: w(bb.koerper.ffmi, '', 1), werte: [], unter: `<span class="sub">${bb.koerper.groesse_cm ? ffmiText(bb.koerper.ffmi) : 'Größe eintragen'}</span>` };
    case 'taille': return { name: 'Taille', f: 'koerper', wert: w(bb.koerper.taille_cm, 'cm', 1), werte: r.taille_cm, unter: bb.koerper.taille_veraenderung_cm == null ? '' : `<span class="sub">${vorz(bb.koerper.taille_veraenderung_cm, 1)} cm</span>` };
    case 'kraft': { const k = bb.kraft; return { name: 'Kraft / Woche', f: 'aktiv', wert: w(k.pro_woche_mittel, `/ ${k.ziel_pro_woche}`, 1), werte: k.wochen.map(x => x.einheiten),
      unter: `<span class="delta ${k.pro_woche_mittel >= k.ziel_pro_woche ? 'gut' : ''}">${k.einheiten} Einheiten</span>` }; }
    case 'score': { const w = d.analyse.woche, v = w.score.wert, u = w.score_vorher.wert; return { name: 'Wochen-Score', f: v >= 80 ? 'gut' : v >= 60 ? 'ernaehrung' : 'schlecht', wert: v == null ? '–' : `${v}<small>/ 100</small>`, werte: [u, v],
      unter: u != null && v != null ? `<span class="delta ${v - u >= 4 ? 'gut' : v - u <= -4 ? 'schlecht' : ''}">${vorz(v - u)} zur Vorwoche</span>` : '' }; }
    case 'kcal_heute': { const i = r.kcal.findLastIndex(v => v != null), k = r.kcal[i], z = r.kcal_ziel[i], typ = r.tagtyp[i];
      return { name: typ === 'rest' ? 'Kalorien · Rest-Day' : 'Kalorien · Trainingstag', f: typ === 'rest' ? 'minus' : 'aktiv', wert: k == null ? '–' : `${zahl(k)}<small>/ ${zahl(z)}</small>`, werte: r.kcal,
        unter: k != null && z ? `<span class="delta ${Math.abs(k - z) <= 200 ? 'gut' : 'schlecht'}">${vorz(k - z)} kcal ${i === r.kcal.length - 1 ? 'heute' : tagKurz(r.tage[i])}</span>` : '' }; }
    case 'cardio': return { name: 'Cardio / Tag', f: 'minus', wert: `${zahl(bb.cardio.mittel_min)}<small>min</small>`, werte: r.cardio_min, unter: bb.cardio.ziel_min ? `<span class="delta ${bb.cardio.mittel_min >= bb.cardio.ziel_min ? 'gut' : 'schlecht'}">Ziel ${bb.cardio.ziel_min} min</span>` : '<span class="sub">kein Ziel</span>' };
    case 'phase': { const sp = bb.phase.seit; return { name: bb.phase.titel + (sp ? ' seit' : ''), f: 'koerper', wert: sp ? `${zahl(sp.wochen, 1)}<small>Wochen</small>` : bb.phase.titel, werte: r.trend_kg,
      unter: sp?.veraenderung_kg != null ? `<span class="sub">${vorz(sp.veraenderung_kg, 1)} kg seit ${tagKurz(sp.start)}</span>` : '<span class="sub">Startdatum eintragen</span>' }; }
    case 'gegessen': return { name: 'Gegessen', f: 'ernaehrung', wert: w(letzter(reihe('dietary_energy')), 'kcal'), werte: reihe('dietary_energy'), unter: bb.energie.empfohlene_kcal ? `<span class="sub">Ziel ${zahl(bb.energie.empfohlene_kcal)}</span>` : delta(reihe('dietary_energy'), null) };
    case 'schlaf': { const v = schlafReihe('gesamt_min'), l = letzter(v); return { name: 'Schlaf', f: 'schlaf', wert: l == null ? '–' : `${Math.floor(l / 60)}<small>h</small> ${String(Math.round(l % 60)).padStart(2, '0')}<small>min</small>`, werte: v, unter: delta(v, true, dauer) }; }
    case 'ruhepuls': { const v = reihe('resting_heart_rate'); return { name: 'Ruhepuls', f: 'herz', wert: w(letzter(v), 'bpm'), werte: v, unter: delta(v, false) }; }
    case 'hrv': { const v = reihe('heart_rate_variability'); return { name: 'HRV', f: 'schlaf', wert: w(letzter(v), 'ms'), werte: v, unter: delta(v, true) }; }
    case 'schritte': { const v = reihe('step_count'); return { name: 'Schritte', f: 'aktiv', wert: w(letzter(v)), werte: v, unter: delta(v, true) }; }
    case 'aktivkalorien': { const v = reihe('active_energy'); return { name: 'Aktivkalorien', f: 'ernaehrung', wert: w(letzter(v), 'kcal'), werte: v, unter: delta(v, true) }; }
    case 'vo2max': { const v = reihe('vo2_max'); return { name: 'VO₂max', f: 'herz', wert: w(letzter(v), '', 1), werte: v, unter: delta(v, true, x => zahl(x, 1)) }; }
    case 'wasser': { const v = reihe('dietary_water'); return { name: 'Wasser', f: 'minus', wert: w(letzter(v), 'ml'), werte: v, unter: delta(v, true) }; }
  }
  return null;
}

function kacheln(d){
  const liste = d.einstellungen.kacheln.map(id => [id, kachelDef(id, d)]).filter(([, k]) => k);
  const n = liste.length, spalten = n <= 5 ? n : Math.ceil(n / Math.ceil(n / 5));
  const box = $('#kacheln'); box.style.setProperty('--spalten', Math.max(1, spalten));
  const ziel = { score: 'analyse', kcal_heute: 'protokoll', cardio: 'protokoll', phase: 'protokoll', gewicht: 'aufbau', rate: 'aufbau', protein_gkg: 'ernaehrung', bilanz: 'aufbau', tdee: 'aufbau', koerperfett: 'aufbau', magermasse: 'aufbau', ffmi: 'aufbau', taille: 'aufbau', kraft: 'training', gegessen: 'ernaehrung', schlaf: 'schlaf', ruhepuls: 'herz', hrv: 'herz', schritte: 'aktivitaet', aktivkalorien: 'aktivitaet', vo2max: 'herz', wasser: 'ernaehrung' };
  const fueller = (spalten - n % spalten) % spalten;
  box.innerHTML = liste.map(([id, k], i) => `<a class="kachel${n % 2 && i === n - 1 ? ' voll' : ''}" href="#${ziel[id]}" style="--k:${farbe(k.f)}"><span class="t"><i></i>${k.name}</span><span class="w">${k.wert}</span><span class="u">${k.unter || '<span></span>'}${spark(k.werte, farbe(k.f))}</span></a>`).join('')
    + '<div class="kachel fueller" aria-hidden="true"></div>'.repeat(fueller);
  box.hidden = !n;
}

/* ── Körper & Aufbau ───────────────────────────────────── */
function aufbau(d){
  const bb = d.bodybuilding, g = bb.gewicht, e = bb.energie, k = bb.koerper, r = bb.reihen;
  const pfeil = g.im_plan == null ? '' : g.im_plan ? 'gut' : 'schlecht';
  $('#phase').innerHTML = `
    <div><span class="etikett">${esc(bb.phase.titel)}${bb.phase.seit ? ` · Woche ${Math.ceil(bb.phase.seit.tage / 7)}` : ''}</span><b>${zahl(g.aktuell_trend_kg, 1)}<small>kg Trend</small></b><em>${bb.phase.seit?.veraenderung_kg != null ? `${vorz(bb.phase.seit.veraenderung_kg, 1)} kg seit ${tagKurz(bb.phase.seit.start)}` : ''}${g.zielgewicht_kg ? ` · Ziel ${zahl(g.zielgewicht_kg, 1)} kg${g.wochen_bis_ziel ? ` in ~${zahl(g.wochen_bis_ziel)} Wo.` : ''}` : ''}</em></div>
    <div><span>Tempo pro Woche</span><b>${vorz(g.rate_kg_woche, 2)}<small>kg</small></b><em class="${pfeil}">${vorz(g.rate_prozent_woche, 2)} % · Ziel ${vorz(g.ziel_rate_prozent_woche, 2)} %</em></div>
    <div><span>Verbrauch (TDEE)</span><b>${zahl(e.tdee_kcal)}<small>kcal</small></b><em>${e.tdee_methode?.startsWith('adaptiv') ? 'adaptiv aus Gewicht + Zufuhr' : 'laut Apple Health'}</em></div>
    <div><span>Ziel Training / Rest</span><b>${zahl(e.ziel_training_kcal)}<small>/ ${zahl(e.ziel_rest_kcal)} kcal</small></b><em>Eiweiß ${zahl(bb.eiweiss.ziel_g)} g · Ø gegessen ${zahl(e.zufuhr_mittel_kcal)}</em></div>`;
  const bd = phasenBaender(bb), mk = cheatMarker(bb);
  linie($('#d-gewicht'), { tage: r.tage, baender: bd, marker: mk, werte: r.trend_kg, punkte: r.gewicht_kg, farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Trend', einheit: 'kg', label: 'Gewicht: Trend und Messungen' });
  divergierend($('#d-bilanz'), { tage: r.tage, baender: bd, marker: mk, werte: r.bilanz_kcal, farbePlus: farbe('plus'), farbeMinus: farbe('minus'), format: v => zahl(Math.abs(v)), einheit: 'kcal', label: 'Energiebilanz pro Tag' });
  balken($('#d-gkg'), { tage: r.tage, werte: r.eiweiss_g_pro_kg, farbe: farbe('mk-eiweiss'), ziel: bb.eiweiss.ziel_g_pro_kg, format: v => zahl(v, 2), name: 'Eiweiß', einheit: 'g/kg', label: 'Eiweiß pro kg Körpergewicht' });
  $('#gkg-k').textContent = bb.eiweiss.mittel_g_pro_kg ? `Ø ${zahl(bb.eiweiss.mittel_g_pro_kg, 2)} g/kg · Ziel ${zahl(bb.eiweiss.ziel_g_pro_kg, 1)}` : '';
  linie($('#d-lbm'), { tage: r.tage, werte: r.magermasse_kg, farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Magermasse', einheit: 'kg', label: 'Magermasse' });
  linie($('#d-fett'), { tage: r.tage, werte: reihe('body_fat_percentage'), farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Körperfett', einheit: '%', label: 'Körperfettanteil' });
  const mini = [['Körperfett', zahl(k.koerperfett_prozent, 1), '%'], ['Magermasse', zahl(k.magermasse_kg, 1), 'kg', k.magermasse_veraenderung_kg != null ? vorz(k.magermasse_veraenderung_kg, 1) + ' kg' : ''],
    ['FFMI', zahl(k.ffmi, 1), '', k.groesse_cm ? ffmiText(k.ffmi) : 'Größe fehlt'], ['Taille', zahl(k.taille_cm, 1), 'cm', k.taille_veraenderung_cm != null ? vorz(k.taille_veraenderung_cm, 1) + ' cm' : '']];
  $('#aufbau-mini').innerHTML = mini.map(([t, v, e, x]) => `<div><span>${t}</span><b>${v}<small>${e}</small></b>${x ? `<em class="mini-x">${esc(x)}</em>` : ''}</div>`).join('');
  $('#aufbau-k').innerHTML = g.rate_kg_woche == null ? 'Noch zu wenig Gewichtsmessungen für einen Trend.' :
    `Du ${g.rate_kg_woche > 0.02 ? 'nimmst' : g.rate_kg_woche < -0.02 ? 'nimmst' : 'hältst'} ${Math.abs(g.rate_kg_woche) > 0.02 ? `<b>${zahl(Math.abs(g.rate_kg_woche), 2)} kg</b> pro Woche ${g.rate_kg_woche > 0 ? 'zu' : 'ab'}` : 'dein Gewicht'} – ${g.im_plan ? '<b>im Plan</b>' : `Ziel: <b>${vorz(g.ziel_rate_kg_woche, 2)} kg</b>`}.`;
}

/* ── Krafttraining ─────────────────────────────────────── */
function training(d){
  const k = d.bodybuilding.kraft, r = d.bodybuilding.reihen;
  const kw = k.wochen.map(w => 'KW ' + +w.woche.split('-W')[1]);
  balken($('#d-kraft'), { tage: kw, werte: k.wochen.map(w => w.einheiten), farbe: farbe('aktiv'), ziel: k.ziel_pro_woche, format: v => zahl(v), name: 'Einheiten', label: 'Krafttrainings pro Woche' });
  $('#kw-k').textContent = `Ø ${zahl(k.pro_woche_mittel, 1)} · Ziel ${k.ziel_pro_woche}`;
  // Kalender: Spalten = Wochen, Zeilen = Mo–So
  const erster = (new Date(r.tage[0] + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const heute = r.tage.at(-1);
  const zellen = Array(erster).fill('<span class="t leer"></span>').concat(r.tage.map((t, i) => {
    const e = r.kraft_tage[i]; const titel = `${tagKurz(t, true)}: ${e.length ? e.map(x => x.art).join(', ') : 'kein Krafttraining'}`;
    return `<span class="t${e.length ? ' an' : ''}${t === heute ? ' heute' : ''}" title="${esc(titel)}" aria-label="${esc(titel)}"></span>`;
  }));
  $('#kalender').innerHTML = zellen.join('');
  $('#kalender').setAttribute('role', 'img');
  $('#kalender').setAttribute('aria-label', `Krafttraining an ${r.kraft_tage.filter(e => e.length).length} von ${r.tage.length} Tagen`);
  const liste = d.workouts.filter(w => KRAFT.test(w.art));
  $('#kraft-liste').innerHTML = liste.length ? liste.slice(0, matchMedia('(max-width: 620px)').matches ? 6 : 12).map(w => `<li><span class="ic" aria-hidden="true">▲</span><span class="a">${esc(w.art)}</span>
    <span class="d">${new Date(w.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} · ${zahl(w.dauer_min)} min${w.energie_kcal ? ' · ' + zahl(w.energie_kcal) + ' kcal' : ''}${w.hf_mittel ? ' · Ø ' + zahl(w.hf_mittel) + ' bpm' : ''}</span></li>`).join('')
    : '<li class="leer">Keine Krafttrainings in diesem Zeitraum. Zeichne sie auf der Apple Watch als „Krafttraining“ auf – oder mit Apps wie Hevy oder Strong, die nach Apple Health schreiben.</li>';
  $('#kraft-k').textContent = liste.length ? `${liste.length} Einheiten · ${dauer(liste.reduce((s, w) => s + (w.dauer_min || 0), 0))}` : '';
  $('#training-k').innerHTML = k.einheiten ? `<b>${k.einheiten}</b> Einheiten, <b>${dauer(k.minuten)}</b> unter der Hantel · Ø <b>${zahl(k.pro_woche_mittel, 1)}</b> pro Woche.` : '';
}
const KRAFT = /kraft|strength|functional|bodybuilding|gewicht|weight|hiit|core|crossfit|calisthenics|push|pull|beine|legs/i;

/* ── Phasen & Cheat Days in Diagrammen ─────────────────── */
const PHASE_FARBE = { aufbau: 'aktiv', diaet: 'minus', erhalt: 'text-3', recomp: 'schlaf' };
function phasenBaender(bb){
  if(!zustand.roh.einstellungen.phasen?.length) return [];
  const p = bb.reihen.phase, aus = [];
  p.forEach((x, i) => { const l = aus.at(-1); if(l && l.phase === x) l.bis = i; else aus.push({ phase: x, von: i, bis: i }); });
  return aus.map(b => ({ ...b, farbe: farbe(PHASE_FARBE[b.phase]), text: PHASE_TITEL[b.phase] }));
}
const cheatMarker = bb => bb.reihen.cheat.map((c, i) => c ? { i, text: 'C', titel: 'Cheat Day' } : null).filter(Boolean);

/* ── Coach-Analyse ─────────────────────────────────────── */
const TON = { kritisch: { z: '!', t: 'Dringend' }, warnung: { z: '▲', t: 'Achtung' }, info: { z: 'i', t: 'Hinweis' }, gut: { z: '✓', t: 'Läuft' } };
function analyseBereich(d){
  const a = d.analyse, w = a.woche, s = w.score.wert, sv = w.score_vorher.wert;
  const ton = s == null ? '' : s >= 80 ? 'gut' : s >= 60 ? 'mittel' : 'schwach';
  const U = 2 * Math.PI * 52;
  $('#score').innerHTML = `
    <div class="ring ${ton}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="spur"/><circle cx="60" cy="60" r="52" class="wert" stroke-dasharray="${U}" stroke-dashoffset="${U * (1 - (s || 0) / 100)}"/></svg>
      <div><b>${s ?? '–'}</b><span>von 100</span></div></div>
    <p class="urteil ${w.urteil}">${w.urteil === 'besser' ? 'Bessere Woche' : w.urteil === 'schlechter' ? 'Schwächere Woche' : w.urteil === 'gleich' ? 'Auf Vorwochen-Niveau' : 'Noch zu wenig Daten'}${sv != null ? ` <span>Vorwoche ${sv}</span>` : ''}</p>
    <ul class="teile">${w.score.teile.map(t => `<li><span>${esc(t.name)}</span><i><b style="width:${t.wert}%"></b></i><em>${t.wert}</em></li>`).join('')}</ul>`;
  $('#score').setAttribute('aria-label', `Wochen-Score ${s ?? 'unbekannt'} von 100`);
  const fmtW = v => v.diese == null ? '–' : v.einheit === 'min' ? dauer(v.diese) : zahl(v.diese, v.nk);
  const fmtL = v => v.letzte == null ? '–' : v.einheit === 'min' ? dauer(v.letzte) : zahl(v.letzte, v.nk);
  $('#vergleich').innerHTML = `<table><thead><tr><th scope="col">Kennzahl</th><th scope="col">Diese</th><th scope="col">Letzte</th><th scope="col"><span class="sr">Bewertung</span></th></tr></thead><tbody>${w.vergleich.map(v => `<tr>
    <th scope="row">${esc(v.titel)}${v.einheit && v.einheit !== 'min' ? ` <small>${esc(v.einheit)}</small>` : ''}</th><td>${fmtW(v)}</td><td>${fmtL(v)}</td>
    <td class="b ${v.besser === true ? 'gut' : v.besser === false ? 'schlecht' : ''}">${v.besser === true ? '▲ besser' : v.besser === false ? '▼ schlechter' : '·'}</td></tr>`).join('')}</tbody></table>`;
  $('#vgl-k').textContent = `${tagKurz(a.zeitraum.von)}–${tagKurz(a.zeitraum.bis)} · ${w.besser} besser, ${w.schlechter} schlechter`;
  $('#erkenntnisse').innerHTML = a.erkenntnisse.length ? a.erkenntnisse.map(x => `<li class="e-${x.ton}"><span class="e-z" aria-hidden="true">${TON[x.ton].z}</span><div><p class="e-t"><span class="sr">${TON[x.ton].t}: </span>${esc(x.titel)}</p><p>${esc(x.text)}</p></div></li>`).join('')
    : '<li class="e-info"><span class="e-z">i</span><div><p class="e-t">Noch keine Auswertung</p><p>Sobald Gewicht, Ernährung, Schlaf und Training ein paar Tage gesynct sind, erscheinen hier Bewertungen.</p></div></li>';
  const dringend = a.erkenntnisse.filter(x => x.ton === 'kritisch' || x.ton === 'warnung').length;
  $('#analyse-k').innerHTML = `${esc(a.phase.titel)}${a.phase.seit ? ` · Woche ${Math.ceil(a.phase.seit.tage / 7)}` : ''} · <b>${dringend}</b> ${dringend === 1 ? 'Punkt braucht' : 'Punkte brauchen'} Aufmerksamkeit, <b>${a.erkenntnisse.filter(x => x.ton === 'gut').length}</b> laufen gut.`;
}

/* ── Protokoll & Plan ──────────────────────────────────── */
function protokollBereich(d){
  const bb = d.bodybuilding, r = bb.reihen, e = d.einstellungen;
  const prot = new Map(d.protokoll.map(p => [p.tag, p]));
  // Phasen-Zeitleiste über das Fenster
  const bd = phasenBaender(bb);
  $('#phasen-band').innerHTML = bd.length ? bd.map(b => `<div style="flex:${b.bis - b.von + 1};--f:${b.farbe}"><b>${esc(b.text)}</b><span>${tagKurz(r.tage[b.von])}${b.bis > b.von ? ' – ' + tagKurz(r.tage[b.bis]) : ''}</span></div>`).join('')
    : '<p class="klein">Keine Phasen eingetragen – unter „Ansicht & Ziele“ Diät- oder Aufbaustart festlegen.</p>';
  // Raster: höchstens 12 Wochen, Montag zuerst
  const max = Math.min(r.tage.length, 84), start = r.tage.length - max;
  const erster = (new Date(r.tage[start] + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const zellen = Array(erster).fill('<span class="pz leer"></span>');
  for(let i = start; i < r.tage.length; i++){
    const t = r.tage[i], p = prot.get(t), typ = r.tagtyp[i], kraft = r.kraft_tage[i].length > 0;
    const klassen = ['pz', typ === 'training' ? 'pz-t' : 'pz-r', kraft ? 'pz-k' : '', r.cheat[i] ? 'pz-c' : '', p?.notiz ? 'pz-n' : '', p?.tagtyp ? 'pz-x' : '', t === d.zeitraum.bis ? 'pz-heute' : ''].filter(Boolean).join(' ');
    const label = `${tagKurz(t, true)}: ${typ === 'training' ? 'Trainingstag' : 'Rest-Day'}${kraft ? ', Krafttraining erledigt' : typ === 'training' ? ', kein Krafttraining' : ''}${r.cardio_min[i] ? `, ${r.cardio_min[i]} min Cardio` : ''}${r.cheat[i] ? ', Cheat Day' : ''}${p?.notiz ? ', Notiz: ' + p.notiz : ''}`;
    zellen.push(`<button type="button" class="${klassen}" data-tag="${t}" aria-label="${esc(label)}" title="${esc(label)}"><span class="pz-d">${+t.slice(8)}</span><span class="pz-typ">${typ === 'training' ? 'T' : 'R'}</span></button>`);
  }
  $('#prot-gitter').innerHTML = zellen.join('');
  // Kalorien gegen Tagesziel, gefärbt nach Tagtyp
  const fT = farbe('aktiv'), fR = farbe('minus');
  balken($('#d-kcal-ziel'), { tage: r.tage, werte: r.kcal, farben: r.tagtyp.map(t => t === 'rest' ? fR : fT), namen: r.tagtyp.map(t => t === 'rest' ? 'Rest-Day' : 'Trainingstag'), zielReihe: r.kcal_ziel,
    format: v => zahl(v), einheit: 'kcal', label: 'Kalorien pro Tag gegen das Tagesziel', marker: cheatMarker(bb), baender: phasenBaender(bb) });
  balken($('#d-cardio'), { tage: r.tage, werte: r.cardio_min, farbe: farbe('minus'), farben: r.tagtyp.map(t => t === 'rest' ? fR : farbe('text-3')), namen: r.tagtyp.map(t => t === 'rest' ? 'Cardio · Rest-Day' : 'Cardio · Trainingstag'),
    ziel: e.ziele.cardio_min_ziel || undefined, format: v => zahl(v), einheit: 'min', label: 'Cardio-Minuten pro Tag' });
  $('#cardio-k').textContent = `Ø ${zahl(bb.cardio.mittel_min)} min${bb.cardio.ziel_min ? ` · Ziel ${bb.cardio.ziel_min}` : ''}${bb.cardio.ziel_rest_min ? ` · Rest-Days ${bb.cardio.ziel_rest_min}` : ''}`;
  const tt = bb.tagtypen;
  $('#prot-k').innerHTML = `${e.plan?.muster?.length ? `Rhythmus <b>${e.plan.muster.join(' · ')}</b> · ` : ''}<b>${bb.kraft.davon_trainiert}</b> von ${bb.kraft.geplante_trainingstage} Trainingstagen trainiert · Rest-Days Ø <b>${zahl(tt.rest.kcal_mittel)}</b> kcal (Ziel ${zahl(tt.rest.kcal_ziel_mittel)})${bb.cheat_days.length ? ` · <b>${bb.cheat_days.length}</b> Cheat Day${bb.cheat_days.length > 1 ? 's' : ''}` : ''}.`;
}

const tabelle = (kopf, zeilen) => `<table><thead><tr>${kopf.map(k => `<th scope="col">${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen.map(z => `<tr>${z.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;

function schlaf(d){
  const phasen = [
    { name: 'Tief', feld: 'tief_min', farbe: farbe('ph-tief') },
    { name: 'Kern', feld: 'kern_min', farbe: farbe('ph-kern') },
    { name: 'REM', feld: 'rem_min', farbe: farbe('ph-rem') },
    { name: 'Wach', feld: 'wach_min', farbe: farbe('ph-wach') },
  ].map(p => ({ ...p, werte: schlafReihe(p.feld) }));
  const ohnePhasen = d.schlaf.length && d.schlaf.every(n => n.tief_min == null);
  const teile = (ohnePhasen ? [{ name: 'Schlaf', farbe: farbe('schlaf'), werte: schlafReihe('gesamt_min') }] : phasen)
    .map(t => ({ ...t, werte: t.werte.map(v => v == null ? null : v / 60) })); // Stunden → runde Achse
  const fmt = { wert: h => dauer(h * 60), achse: v => zahl(v, 1) + ' h' };
  if(!d.schlaf.length){ leer($('#d-schlaf'), 'Schlafphasen'); leer($('#d-fenster'), 'Schlaffenster'); $('#schlaf-k').textContent = ''; $('#schlaf-leg').innerHTML = ''; return; }
  stapel($('#d-schlaf'), { tage: d.tage, teile, format: fmt, ziel: d.einstellungen.ziele.schlaf_ziel_h, label: 'Schlafphasen pro Nacht, gestapelt in Stunden' });
  $('#schlaf-leg').innerHTML = [...teile].reverse().map(t => `<li><i style="background:${t.farbe}"></i>${t.name} <b>${dauer(mittel(t.werte) * 60)}</b></li>`).join('');
  fenster($('#d-fenster'), { tage: d.tage, naechte: d.schlaf, farbe: farbe('schlaf'), zone: d.zeitzone, label: 'Einschlaf- und Aufwachzeiten' });
  const zielMin = d.einstellungen.ziele.schlaf_ziel_h * 60, g = mittel(d.schlaf.map(n => n.gesamt_min)), unter7 = d.schlaf.filter(n => n.gesamt_min < zielMin - 30).length;
  const uhr = (iso, plus) => { const t = new Date(iso); let m = t.getHours() * 60 + t.getMinutes(); if(plus && m < 720) m += 1440; return m; };
  const ein = mittel(d.schlaf.filter(n => n.start).map(n => uhr(n.start, true))), auf = mittel(d.schlaf.filter(n => n.ende).map(n => uhr(n.ende)));
  const hm = m => m == null ? '–' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const streu = (() => { const v = d.schlaf.filter(n => n.start).map(n => uhr(n.start, true)); if(v.length < 3) return null; const m = mittel(v); return Math.sqrt(mittel(v.map(x => (x - m) ** 2))); })();
  $('#schlaf-k').innerHTML = `Im Schnitt <b>${dauer(g)}</b> pro Nacht · <b>${unter7}</b> von ${d.schlaf.length} Nächten mehr als 30 min unter deinem Ziel.`;
  $('#fenster-k').innerHTML = `Ø ${hm(ein)} → ${hm(auf)}${streu != null ? ` · ± ${zahl(streu)} min` : ''}`;
  $('#t-schlaf').innerHTML = tabelle(['Nacht', 'Gesamt', 'Tief', 'Kern', 'REM', 'Wach', 'Eingeschlafen', 'Aufgewacht'],
    [...d.schlaf].reverse().map(n => [tagKurz(n.nacht, true), dauer(n.gesamt_min), dauer(n.tief_min), dauer(n.kern_min), dauer(n.rem_min), n.wach_min == null ? '–' : zahl(n.wach_min) + ' min',
      n.start ? new Date(n.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–', n.ende ? new Date(n.ende).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–']));
}

function herz(d){
  const rhr = reihe('resting_heart_rate'), hrv = reihe('heart_rate_variability');
  linie($('#d-rhr'), { tage: d.tage, werte: rhr, farbe: farbe('herz'), format: v => zahl(v), name: 'Ruhepuls', einheit: 'bpm', label: 'Ruhepuls pro Tag' });
  linie($('#d-hrv'), { tage: d.tage, werte: hrv, farbe: farbe('schlaf'), format: v => zahl(v), name: 'HRV', einheit: 'ms', label: 'Herzfrequenzvariabilität pro Tag' });
  const hf = spanne('heart_rate');
  linie($('#d-hf'), { tage: d.tage, werte: hf.map(p => p?.wert ?? null), spanne: hf.map(p => p && p.min != null ? { min: p.min, max: p.max } : null), farbe: farbe('herz'), format: v => zahl(v), name: 'Mittel', einheit: 'bpm', label: 'Herzfrequenz mit Tagesspanne' });
  const mini = [['VO₂max', 'vo2_max', 'ml/kg·min', 1], ['Blutsauerstoff', 'blood_oxygen_saturation', '%', 1], ['Atemfrequenz', 'respiratory_rate', '/min', 1], ['Gehpuls', 'walking_heart_rate_average', 'bpm', 0]];
  $('#herz-mini').innerHTML = mini.map(([t, m, e, nk]) => `<div><span>${t}</span><b>${zahl(letzter(reihe(m)), nk)}<small>${e}</small></b></div>`).join('');
  const r = mittel(rhr), h = mittel(hrv);
  $('#herz-k').innerHTML = r ? `Ruhepuls Ø <b>${zahl(r)} bpm</b>${h ? ` · HRV Ø <b>${zahl(h)} ms</b>` : ''}.` : '';
}

const SYMBOL = { lauf: '↗', run: '↗', rad: '◎', cycl: '◎', kraft: '▲', strength: '▲', yoga: '◡', schwimm: '≈', swim: '≈', geh: '·', walk: '·', hiit: '✦' };
const symbol = art => { const a = art.toLowerCase(); for(const [k, v] of Object.entries(SYMBOL)) if(a.includes(k)) return v; return '●'; };

function aktivitaet(d){
  const schritte = reihe('step_count');
  balken($('#d-schritte'), { tage: d.tage, werte: schritte, farbe: farbe('aktiv'), ziel: d.einstellungen.ziele.schritte_ziel, format: v => zahl(v), name: 'Schritte', label: 'Schritte pro Tag' });
  balken($('#d-energie'), { tage: d.tage, werte: reihe('active_energy'), farbe: farbe('ernaehrung'), format: v => zahl(v), name: 'Aktivkalorien', einheit: 'kcal', label: 'Aktivkalorien pro Tag' });
  const wo = d.workouts;
  $('#wo-k').textContent = wo.length ? `${wo.length} Einheiten · ${dauer(wo.reduce((s, w) => s + (w.dauer_min || 0), 0))}` : '';
  $('#workouts').innerHTML = wo.length ? wo.slice(0, matchMedia('(max-width: 620px)').matches ? 6 : 12).map(w => `<li><span class="ic" aria-hidden="true">${symbol(w.art)}</span><span class="a">${esc(w.art)}</span>
    <span class="d">${new Date(w.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} · ${zahl(w.dauer_min)} min${w.distanz_km ? ' · ' + zahl(w.distanz_km, 1) + ' km' : ''}${w.energie_kcal ? ' · ' + zahl(w.energie_kcal) + ' kcal' : ''}</span></li>`).join('')
    : '<li class="leer">Keine Trainings in diesem Zeitraum.</li>';
  const s = mittel(schritte), ziel = schritte.filter(v => v >= d.einstellungen.ziele.schritte_ziel).length;
  $('#akt-k').innerHTML = s ? `Ø <b>${zahl(s)}</b> Schritte · Ziel an <b>${ziel}</b> von ${schritte.filter(v => v != null).length} Tagen erreicht.` : '';
}

function ernaehrung(d){
  const ew = reihe('protein'), kh = reihe('carbohydrates'), fe = reihe('total_fat'), kcal = reihe('dietary_energy');
  const teile = [
    { name: 'Eiweiß', farbe: farbe('mk-eiweiss'), werte: ew.map(v => v == null ? null : v * 4) },
    { name: 'Kohlenhydrate', farbe: farbe('mk-kh'), werte: kh.map(v => v == null ? null : v * 4) },
    { name: 'Fett', farbe: farbe('mk-fett'), werte: fe.map(v => v == null ? null : v * 9) },
  ];
  if(!kcal.some(v => v != null)){ leer($('#d-makro'), 'Makronährstoffe'); $('#ern-schnitt').innerHTML = '<p class="klein">Noch keine Ernährungsdaten. Apps wie Yazio, MyFitnessPal oder Lifesum schreiben sie in Apple Health.</p>'; $('#ern-k').textContent = ''; $('#makro-leg').innerHTML = ''; return; }
  stapel($('#d-makro'), { tage: d.tage, teile, ziel: d.bodybuilding.energie.empfohlene_kcal, format: { wert: v => zahl(v) + ' kcal', achse: v => zahl(v) }, label: 'Kalorien aus Makronährstoffen pro Tag' });
  const g = [mittel(ew), mittel(kh), mittel(fe)], k = g[0] * 4 + g[1] * 4 + g[2] * 9;
  $('#makro-leg').innerHTML = teile.map((t, i) => `<li><i style="background:${t.farbe}"></i>${t.name} <b>${zahl(g[i] * (i === 2 ? 9 : 4) / k * 100)} %</b></li>`).join('');
  const zeile = (n, w, e, f) => `<div class="z"><span>${f ? `<i style="background:${f}"></i>` : ''}${n}</span><b>${w == null ? '–' : zahl(w) + ' ' + e}</b></div>`;
  $('#ern-schnitt').innerHTML = `<div class="gross">${zahl(mittel(kcal))}<small>kcal</small></div>
    <div class="aufteilung" aria-hidden="true">${teile.map((t, i) => `<span style="flex:${g[i] * (i === 2 ? 9 : 4)};background:${t.farbe}"></span>`).join('')}</div>
    ${zeile('Eiweiß', g[0], 'g', teile[0].farbe)}${d.bodybuilding.eiweiss.mittel_g_pro_kg ? `<div class="z"><span>&nbsp;&nbsp;&nbsp;&nbsp;pro kg Körpergewicht</span><b>${zahl(d.bodybuilding.eiweiss.mittel_g_pro_kg, 2)} g</b></div>` : ''}${zeile('Kohlenhydrate', g[1], 'g', teile[1].farbe)}${zeile('Fett', g[2], 'g', teile[2].farbe)}
    ${zeile('Ballaststoffe', mittel(reihe('fiber')), 'g')}${zeile('Zucker', mittel(reihe('dietary_sugar')), 'g')}${zeile('Wasser', mittel(reihe('dietary_water')), 'ml')}${zeile('Koffein', mittel(reihe('dietary_caffeine')), 'mg')}`;
  const tageMit = kcal.filter(v => v != null).length;
  const emp = d.bodybuilding.energie.empfohlene_kcal;
  $('#ern-k').innerHTML = `An <b>${tageMit}</b> von ${d.tage.length} Tagen erfasst · Ø <b>${zahl(mittel(kcal))}</b>${emp ? ` von <b>${zahl(emp)}</b>` : ''} kcal · <b>${zahl(g[0])} g</b> Eiweiß.`;
}

/* ── Zeitraum & Zoom ───────────────────────────────────── */
function zoomKnoepfe(){
  const t = zustand.tage, std = [7, 30, 90, 365];
  document.querySelectorAll('#zeitraum button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.tage === t)));
  let x = $('#zeitraum .frei');
  if(!std.includes(t)){ if(!x){ x = document.createElement('span'); x.className = 'frei'; $('#zeitraum').appendChild(x); } x.textContent = t + ' T'; }
  else x?.remove();
}
function tageSetzen(t, { still = false } = {}){
  t = Math.max(7, Math.min(365, Math.round(t)));
  if(t === zustand.tage) return;
  zustand.tage = t; SPEICHER.set('puls.tage', t);
  if(zustand.roh && t <= zustand.roh.tage_geladen){ zustand.daten = ansicht(zustand.roh, t); zeichnen(); }
  else if(!still) aktualisieren();
}
const naechsteStufe = (t, richtung) => richtung > 0 ? ZOOM.find(z => z > t) ?? 365 : [...ZOOM].reverse().find(z => z < t) ?? 7;
const schnapp = t => ZOOM.reduce((a, b) => Math.abs(Math.log(b / t)) < Math.abs(Math.log(a / t)) ? b : a);

$('#zeitraum').addEventListener('click', e => { const b = e.target.closest('button'); if(b) tageSetzen(+b.dataset.tage); });
$('#zeitraum').addEventListener('keydown', e => {
  if(!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const bs = [...document.querySelectorAll('#zeitraum button')], i = Math.max(0, bs.findIndex(b => b.getAttribute('aria-checked') === 'true'));
  const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click();
});

/** Pinch-Zoom mit zwei Fingern auf jedem Diagramm: auseinander = näher ran (weniger Tage), zusammen = mehr Tage. */
const anzeige = $('#zoom-anzeige');
let pinch = null, anzeigeT;
const abstand = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
function zeigeZoom(t){ anzeige.hidden = false; anzeige.textContent = t >= 365 ? '1 Jahr' : `${t} Tage`; clearTimeout(anzeigeT); anzeigeT = setTimeout(() => anzeige.hidden = true, 900); }
document.addEventListener('touchstart', e => {
  if(e.touches.length === 2 && e.target.closest('.dia, .prot-gitter, .kacheln')){ pinch = { d0: abstand(e.touches), t0: zustand.tage, raf: 0 }; $('#zoom-tipp').hidden = true; SPEICHER.set('puls.zoom-gesehen', '1'); }
}, { passive: true });
document.addEventListener('touchmove', e => {
  if(!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const ziel = schnapp(pinch.t0 * pinch.d0 / abstand(e.touches));
  zeigeZoom(ziel);
  if(ziel !== zustand.tage && !pinch.raf) pinch.raf = requestAnimationFrame(() => { if(pinch) pinch.raf = 0; tageSetzen(ziel, { still: true }); });
}, { passive: false });
document.addEventListener('touchend', e => { if(pinch && e.touches.length < 2){ const t = zustand.tage; pinch = null; if(zustand.roh && t > zustand.roh.tage_geladen) aktualisieren(); } });
// Safari-Gesten im Diagramm nicht als Seitenzoom behandeln
for(const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => { if(e.target.closest?.('.dia, .prot-gitter, .kacheln')) e.preventDefault(); }, { passive: false });
// Trackpad-Pinch bzw. Strg + Mausrad am Rechner
document.addEventListener('wheel', e => {
  if(!e.ctrlKey || !e.target.closest('.dia, .prot-gitter')) return;
  e.preventDefault();
  const t = naechsteStufe(zustand.tage, e.deltaY > 0 ? 1 : -1); zeigeZoom(t); tageSetzen(t);
}, { passive: false });

/* ── Verbinden ─────────────────────────────────────────── */
async function verbinden(){
  const dlg = $('#verbinden'); dlg.showModal();
  if(VORSCHAU){ $('#v-mcp').textContent = 'Erscheint, sobald deine eigene Puls-App online ist'; $('#v-sync').textContent = 'Erscheint, sobald deine eigene Puls-App online ist'; $('#v-warn').hidden = false; $('#v-warn').textContent = 'Das ist die Vorschau mit Beispieldaten. Hier ist nichts mit Apple Health oder Claude verbunden.'; return; }
  const r = await fetch('/api/daten?tage=7&verbindung=1', { headers: { 'x-puls-code': zustand.code } }).then(x => x.json()).catch(() => null);
  if(r?.verbindung){ $('#v-mcp').textContent = r.verbindung.mcp; $('#v-sync').textContent = r.verbindung.sync; $('#v-warn').hidden = r.verbindung.tokenGesetzt; }
}
$('#claude-knopf').addEventListener('click', verbinden);
$('#claude-knopf-2').addEventListener('click', verbinden);
$('#verbinden').addEventListener('click', async e => {
  if(e.target === e.currentTarget) return e.currentTarget.close();
  const b = e.target.closest('[data-kopie]'); if(!b) return;
  const t = $('#' + b.dataset.kopie);
  try { await navigator.clipboard.writeText(t.textContent); b.textContent = 'Kopiert ✓'; setTimeout(() => b.textContent = 'Kopieren', 1600); }
  catch { const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); }
});

/* ── Speichern: Einstellungen & Protokoll ──────────────── */
async function einstellungenSpeichern(e){
  if(VORSCHAU){ lokal.schreiben('puls.vorschau.einstellungen', e); zustand.roh.einstellungen = structuredClone(e); }
  else {
    const r = await fetch('/api/einstellungen', { method: 'PUT', headers: { 'x-puls-code': zustand.code, 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.message || 'Speichern fehlgeschlagen.');
    zustand.roh.einstellungen = j.einstellungen;
  }
  neuRechnen();
}
async function protokollSpeichern(eintrag){
  const leer = !eintrag.cheat && !eintrag.tagtyp && !eintrag.notiz;
  if(!VORSCHAU){
    const r = await fetch('/api/protokoll', { method: 'PUT', headers: { 'x-puls-code': zustand.code, 'Content-Type': 'application/json' }, body: JSON.stringify(eintrag) });
    if(!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Speichern fehlgeschlagen.');
  }
  const liste = zustand.roh.protokoll.filter(p => p.tag !== eintrag.tag);
  if(!leer) liste.push(eintrag);
  zustand.roh.protokoll = liste.sort((a, b) => a.tag.localeCompare(b.tag));
  if(VORSCHAU) lokal.schreiben('puls.vorschau.protokoll', zustand.roh.protokoll);
  neuRechnen();
}

/* ── Vorlagen direkt antippen ──────────────────────────── */
function vorlagenLeiste(d){
  const v = d.meta?.vorlagen || {}, akt = d.einstellungen.vorlage;
  $('#vorlagen-leiste').innerHTML = Object.entries(v).map(([id, x]) => `<button type="button" data-vorlage="${id}" aria-pressed="${akt === id}">${esc(x.titel)}</button>`).join('')
    + `<button type="button" data-eigene aria-pressed="${akt === 'eigene'}">Eigene …</button>`;
  $('#zoom-tipp').hidden = !!SPEICHER.get('puls.zoom-gesehen') || !matchMedia('(pointer: coarse)').matches;
}
$('#vorlagen-leiste').addEventListener('click', async e => {
  const b = e.target.closest('button'); if(!b) return;
  if(b.hasAttribute('data-eigene')) return anpassenOeffnen();
  const id = b.dataset.vorlage, v = zustand.roh.meta.vorlagen[id];
  try { await einstellungenSpeichern({ ...zustand.roh.einstellungen, vorlage: id, kacheln: [...v.kacheln], bereiche: [...v.bereiche] }); } catch {}
});

/* ── Ansicht & Ziele ───────────────────────────────────── */
const anpassen = { entwurf: null };
const MUSTER = { '2 an / 1 frei': ['T', 'T', 'R'], '3 an / 1 frei': ['T', 'T', 'T', 'R'], '1 an / 1 frei': ['T', 'R'], '5 an / 2 frei': ['T', 'T', 'T', 'T', 'T', 'R', 'R'], 'PPL ×2 / 1 frei': ['T', 'T', 'T', 'T', 'T', 'T', 'R'] };

function anpassenZeichnen(){
  const meta = zustand.roh.meta, e = anpassen.entwurf;
  $('#a-vorlagen').innerHTML = Object.entries(meta.vorlagen).map(([id, v]) => `<label><input type="radio" name="vorlage" value="${id}"${e.vorlage === id ? ' checked' : ''}><b>${esc(v.titel)}</b><span>${esc(v.text)}</span></label>`).join('')
    + `<label><input type="radio" name="vorlage" value="eigene"${e.vorlage === 'eigene' ? ' checked' : ''}><b>Eigene</b><span>Deine eigene Auswahl unten.</span></label>`;
  $('#a-kacheln').innerHTML = Object.entries(meta.kacheln).map(([id, t]) => `<label><input type="checkbox" value="${id}"${e.kacheln.includes(id) ? ' checked' : ''}>${esc(t)}</label>`).join('');
  $('#a-kachel-n').textContent = `· ${e.kacheln.length} gewählt, Reihenfolge wie angeklickt`;
  const alle = [...e.bereiche, ...Object.keys(meta.bereiche).filter(b => !e.bereiche.includes(b))];
  $('#a-bereiche').innerHTML = alle.map((id, i) => { const an = e.bereiche.includes(id); return `<li class="${an ? '' : 'aus'}" data-id="${id}"><label><input type="checkbox"${an ? ' checked' : ''}>${esc(meta.bereiche[id])}</label>
    <button type="button" data-hoch aria-label="${esc(meta.bereiche[id])} nach oben"${i === 0 || !an ? ' disabled' : ''}>↑</button><button type="button" data-runter aria-label="${esc(meta.bereiche[id])} nach unten"${!an || i >= e.bereiche.length - 1 ? ' disabled' : ''}>↓</button></li>`; }).join('');
  // Phasen
  $('#a-phasen').innerHTML = e.phasen.length ? e.phasen.map((p, i) => `<li data-i="${i}">
      <select data-feld="phase" aria-label="Phase">${Object.entries(meta.phasen).map(([id, t]) => `<option value="${id}"${p.phase === id ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <input type="date" data-feld="start" value="${p.start}" aria-label="Start">
      <input type="text" data-feld="notiz" value="${esc(p.notiz)}" placeholder="Notiz" aria-label="Notiz" maxlength="200">
      <button type="button" data-weg aria-label="Phase entfernen">×</button></li>`).join('')
    : '<li class="leer">Noch keine Phase. Lege z. B. „Aufbau ab 1. September“ an – Tempo, Kalorienziel und Analyse richten sich danach.</li>';
  // Rhythmus
  $('#a-muster-vorlagen').innerHTML = Object.keys(MUSTER).map(k => `<button type="button" data-muster="${k}" aria-pressed="${MUSTER[k].join() === e.plan.muster.join()}">${k}</button>`).join('');
  $('#a-muster').innerHTML = e.plan.muster.map((x, i) => `<button type="button" class="m-${x}" data-i="${i}" aria-label="Tag ${i + 1}: ${x === 'T' ? 'Trainingstag' : 'Rest-Day'}">${x}</button>`).join('')
    + '<button type="button" class="m-plus" data-plus aria-label="Tag anhängen">+</button>' + (e.plan.muster.length ? '<button type="button" class="m-minus" data-minus aria-label="Letzten Tag entfernen">−</button>' : '');
  $('#a-plan-start').value = e.plan.start || '';
  const heute = zustand.roh.heute;
  $('#a-plan-vorschau').innerHTML = e.plan.muster.length && e.plan.start ? tagesListe(heute, tagPlus(heute, 13)).map(t => { const x = tagTyp(t, e.plan, new Map()); return `<span class="v-${x}" title="${tagKurz(t, true)}">${'SMDMDFS'[new Date(t + 'T12:00:00Z').getUTCDay()]}</span>`; }).join('') : '<span class="klein">Rhythmus und Starttag wählen</span>';
  const f = $('#anpassen-form');
  for(const [k, v] of Object.entries(e.ziele)) if(f.elements[k] && f.elements[k].tagName === 'INPUT') f.elements[k].value = v ?? '';
}

async function anpassenOeffnen(){
  if(!zustand.roh) return;
  anpassen.entwurf = structuredClone(zustand.roh.einstellungen);
  anpassen.entwurf.plan ||= { muster: [], start: null };
  anpassen.entwurf.phasen ||= [];
  anpassenZeichnen(); $('#a-status').textContent = '';
  $('#anpassen').showModal();
}
const eigene = () => { anpassen.entwurf.vorlage = 'eigene'; };

$('#a-vorlagen').addEventListener('change', e => {
  const id = e.target.value, v = zustand.roh.meta.vorlagen[id];
  anpassen.entwurf.vorlage = id;
  if(v){ anpassen.entwurf.kacheln = [...v.kacheln]; anpassen.entwurf.bereiche = [...v.bereiche]; }
  anpassenZeichnen();
});
$('#a-kacheln').addEventListener('change', e => {
  const k = anpassen.entwurf.kacheln, id = e.target.value;
  anpassen.entwurf.kacheln = e.target.checked ? [...k, id] : k.filter(x => x !== id);
  eigene(); anpassenZeichnen();
});
$('#a-bereiche').addEventListener('click', e => {
  const li = e.target.closest('li'); if(!li) return;
  const b = anpassen.entwurf.bereiche, id = li.dataset.id, i = b.indexOf(id);
  if(e.target.matches('input')){ anpassen.entwurf.bereiche = e.target.checked ? [...b, id] : b.filter(x => x !== id); }
  else if(e.target.closest('[data-hoch]') && i > 0){ [b[i - 1], b[i]] = [b[i], b[i - 1]]; }
  else if(e.target.closest('[data-runter]') && i < b.length - 1){ [b[i + 1], b[i]] = [b[i], b[i + 1]]; }
  else return;
  eigene(); anpassenZeichnen();
  const fokus = $(`#a-bereiche li[data-id="${id}"] ${e.target.closest('[data-hoch]') ? '[data-hoch]' : e.target.closest('[data-runter]') ? '[data-runter]' : 'input'}`);
  if(fokus && !fokus.disabled) fokus.focus();
});
$('#a-phase-neu').addEventListener('click', () => {
  const letzte = anpassen.entwurf.phasen.at(-1)?.phase;
  anpassen.entwurf.phasen.push({ phase: letzte === 'aufbau' ? 'diaet' : 'aufbau', start: zustand.roh.heute, notiz: '' });
  anpassenZeichnen(); $('#a-phasen li:last-child select')?.focus();
});
$('#a-phasen').addEventListener('input', e => {
  const li = e.target.closest('li[data-i]'); if(!li) return;
  anpassen.entwurf.phasen[+li.dataset.i][e.target.dataset.feld] = e.target.value;
});
$('#a-phasen').addEventListener('click', e => {
  const w = e.target.closest('[data-weg]'); if(!w) return;
  anpassen.entwurf.phasen.splice(+w.closest('li').dataset.i, 1); anpassenZeichnen();
});
$('#a-muster-vorlagen').addEventListener('click', e => {
  const b = e.target.closest('[data-muster]'); if(!b) return;
  anpassen.entwurf.plan.muster = [...MUSTER[b.dataset.muster]];
  anpassen.entwurf.plan.start ||= zustand.roh.heute;
  anpassenZeichnen();
});
$('#a-muster').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const m = anpassen.entwurf.plan.muster;
  if(b.hasAttribute('data-plus')){ if(m.length < 14) m.push('T'); anpassen.entwurf.plan.start ||= zustand.roh.heute; }
  else if(b.hasAttribute('data-minus')) m.pop();
  else m[+b.dataset.i] = m[+b.dataset.i] === 'T' ? 'R' : 'T';
  anpassenZeichnen();
});
$('#a-plan-start').addEventListener('input', e => { anpassen.entwurf.plan.start = e.target.value || null; anpassenZeichnen(); });
$('#anpassen-form').addEventListener('input', e => {
  if(!e.target.closest('.felder') || !e.target.name) return;
  const z = anpassen.entwurf.ziele;
  z[e.target.name] = e.target.value === '' ? null : Number(e.target.value);
});
$('#anpassen-form').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('#a-status'); st.textContent = 'Speichere …';
  try { await einstellungenSpeichern(anpassen.entwurf); st.textContent = ''; $('#anpassen').close(); }
  catch(err){ st.textContent = err.message; }
});
$('#anpassen').addEventListener('click', e => { if(e.target === e.currentTarget || e.target.closest('[data-zu]')) e.currentTarget.close(); });
$('#anpassen-knopf').addEventListener('click', anpassenOeffnen);

/* ── Tag bearbeiten (Protokoll) ────────────────────────── */
function tagOeffnen(tag){
  const d = zustand.daten, roh = zustand.roh, bb = d.bodybuilding;
  const p = roh.protokoll.find(x => x.tag === tag) || { tag, cheat: false, tagtyp: null, notiz: '' };
  const i = bb.reihen.tage.indexOf(tag);
  const laut = tagTyp(tag, roh.einstellungen.plan, new Map());
  const phase = phaseAm(tag, roh.einstellungen.phasen, roh.einstellungen.ziele.phase);
  $('#t-titel').textContent = tagKurz(tag, true);
  const zeile = (k, v) => v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '';
  const kraft = i >= 0 ? bb.reihen.kraft_tage[i] : [];
  $('#t-info').innerHTML = zeile('Phase', esc(PHASE_TITEL[phase.phase])) + zeile('Laut Rhythmus', laut ? (laut === 'training' ? 'Trainingstag' : 'Rest-Day') : 'kein Rhythmus eingetragen')
    + (i >= 0 ? zeile('Gegessen', bb.reihen.kcal[i] != null ? `${zahl(bb.reihen.kcal[i])} kcal${bb.reihen.kcal_ziel[i] ? ` · Ziel ${zahl(bb.reihen.kcal_ziel[i])}` : ''}` : 'nicht geloggt')
      + zeile('Krafttraining', kraft.length ? kraft.map(k => `${esc(k.art)} (${zahl(k.dauer_min)} min)`).join(', ') : '–')
      + zeile('Cardio', bb.reihen.cardio_min[i] ? `${zahl(bb.reihen.cardio_min[i])} min` : '–') : '');
  const f = $('#tag-form');
  f.dataset.tag = tag;
  f.querySelectorAll('input[name=tagtyp]').forEach(r => r.checked = (r.value || null) === (p.tagtyp || null));
  $('#t-cheat').checked = !!p.cheat; $('#t-notiz').value = p.notiz || ''; $('#t-status').textContent = '';
  $('#tag-dlg').showModal();
}
$('#tag-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget, typ = f.querySelector('input[name=tagtyp]:checked')?.value || null;
  $('#t-status').textContent = 'Speichere …';
  try { await protokollSpeichern({ tag: f.dataset.tag, cheat: $('#t-cheat').checked, tagtyp: typ, notiz: $('#t-notiz').value.trim() }); $('#tag-dlg').close(); }
  catch(err){ $('#t-status').textContent = err.message; }
});
$('#tag-dlg').addEventListener('click', e => { if(e.target === e.currentTarget || e.target.closest('[data-zu]')) e.currentTarget.close(); });
$('#prot-gitter').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if(b) tagOeffnen(b.dataset.tag); });

let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(zeichnen, 150); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', zeichnen);
addEventListener('scroll', () => $('#kopf').classList.toggle('fest', scrollY > 8), { passive: true });
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && zustand.roh && !VORSCHAU) aktualisieren({ neu: true }); });

if(!VORSCHAU && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

aktualisieren({ neu: true });
